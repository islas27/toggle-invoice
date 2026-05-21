#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, createWriteStream } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { parse as parseCSV } from "csv-parse/sync";
import { load as loadYAML } from "js-yaml";

const require = createRequire(import.meta.url);
const PdfPrinter = require("pdfmake");

const __dirname = dirname(fileURLToPath(import.meta.url));

const FONTS = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

function roundNumber(n) {
  const r = Math.round(n * 2) / 2;
  return r === 0 ? 0.5 : r;
}

function hmsToFloat(str) {
  let s = str;
  let sign = 1;
  if (s[0] === "-") {
    sign = -1;
    s = s.slice(1);
  }
  const [h, m, sec] = s.split(":").map(Number);
  return sign * (h + m / 60 + sec / 3600);
}

function msToFloat(str) {
  let s = str.slice(0, -4); // strip " min"
  let sign = 1;
  if (s[0] === "-") {
    sign = -1;
    s = s.slice(1);
  }
  const [m, sec] = s.split(":").map(Number);
  return sign * (m / 60 + sec / 3600);
}

function durationToFloat(str) {
  return str.split(":").length === 2 ? msToFloat(str) : hmsToFloat(str);
}

function formatMoney(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function bankDetailsTable(bank, gray) {
  return {
    table: {
      widths: ["*", "*"],
      body: [
        [{ text: "Bank Details", bold: true, fillColor: gray, colSpan: 2 }, {}],
        ["Bank Name", { text: bank.name, alignment: "right" }],
        ["Bank SWIFT Number", { text: bank.swift_number, alignment: "right" }],
        [
          "Bank Account Number",
          { text: bank.account_number, alignment: "right" },
        ],
        ["Recipient Name", { text: bank.recipient_name, alignment: "right" }],
        [
          "Recipient Home Address",
          {
            text: `${bank.recipient_address1}\n${bank.recipient_address2}`,
            alignment: "right",
          },
        ],
      ],
    },
    layout: "lightHorizontalLines",
    margin: [0, 60, 0, 0],
  };
}

function buildDocDefinition(invoice) {
  const gray = "#e6e6e6";
  return {
    pageSize: "LETTER",
    pageMargins: [53, 50, 40, 20],
    defaultStyle: { font: "Helvetica", fontSize: 10, lineHeight: 1.25 },
    content: [
      // 1. Header: bill_from (2 cols) + invoice info
      {
        columns: [
          { stack: [invoice.bill_from.name, invoice.bill_from.email] },
          { stack: [invoice.bill_from.street, invoice.bill_from.locality] },
          {
            stack: [
              `Invoice Number  ${invoice.number}`,
              `Invoice Date    ${invoice.date}`,
              { text: `Balance Due     ${invoice.total_amount}`, bold: true },
            ],
          },
        ],
        columnGap: 10,
        margin: [0, 0, 0, 20],
      },
      // 2. Bill To
      {
        stack: [
          invoice.bill_to.name,
          invoice.bill_to.street,
          invoice.bill_to.locality,
        ],
        margin: [0, 0, 0, 20],
      },
      // 3. Line items table
      {
        table: {
          headerRows: 1,
          widths: [70, "*", 70, 55, 65],
          body: [
            [
              { text: "Date", fillColor: gray, bold: true },
              { text: "Description", fillColor: gray, bold: true },
              { text: "Unit Cost", fillColor: gray, bold: true },
              { text: "Quantity", fillColor: gray, bold: true },
              { text: "Line Total", fillColor: gray, bold: true },
            ],
            ...invoice.lineItems.map((i) => [
              i.startDate,
              i.description,
              i.rate,
              String(i.roundedHours),
              i.amount,
            ]),
          ],
        },
        layout: "lightHorizontalLines",
        margin: [0, 0, 0, 0],
      },
      // 4. Summary by project
      {
        table: {
          widths: ["*", 70],
          body: [
            [
              {
                text: "Summary by Project",
                bold: true,
                fillColor: gray,
                colSpan: 2,
              },
              {},
            ],
            ...invoice.summary.map((s) => [
              { text: s.project, bold: true },
              { text: s.amount, alignment: "right" },
            ]),
          ],
        },
        layout: "lightHorizontalLines",
        margin: [340, 100, 0, 0],
      },
      // 5. Totals
      {
        table: {
          widths: ["*", 70],
          body: [
            ["Subtotal", { text: invoice.total_amount, alignment: "right" }],
            ["Paid To Date", { text: "$0.00", alignment: "right" }],
            [
              { text: "Balance Due", fillColor: gray },
              {
                text: invoice.total_amount,
                fillColor: gray,
                alignment: "right",
              },
            ],
          ],
        },
        layout: "lightHorizontalLines",
        margin: [340, 0, 0, 0],
      },
      // 6. Bank details (optional)
      ...(invoice.bank_details?.enabled
        ? [bankDetailsTable(invoice.bank_details, gray)]
        : []),
    ],
  };
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: toggl-invoice.js <csv-file>");
    process.exit(1);
  }

  const config = loadYAML(
    readFileSync(join(__dirname, "config/config.yml"), "utf8"),
  );
  const clients = loadYAML(
    readFileSync(join(__dirname, "config/clients.yml"), "utf8"),
  );

  const now = new Date();
  const invoiceDate = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const invoiceNumber = now.toISOString().slice(0, 10).replace(/-/g, "");

  const invoice = {
    date: invoiceDate,
    number: invoiceNumber,
    bill_from: config.company,
    bank_details: config.bank,
    bill_to: null,
    lineItems: [],
    summary: {},
    total_amount: "",
  };

  let client = null;
  let invoiceSave = "";
  let totalCents = 0;

  const rows = parseCSV(readFileSync(csvPath, "utf8"), { columns: true });

  // Group rows by Description, preserving insertion order
  const groups = {};
  for (const row of rows) {
    const desc = row["Description"];
    if (!groups[desc]) groups[desc] = [];
    groups[desc].push(row);
  }

  for (const group of Object.values(groups)) {
    const firstRow = group[0];
    if (!firstRow["Client"]) {
        throw new Error(`Row with description "${firstRow["Description"]}" is missing a Client value`);
      }

    if (client === null) {
      client = clients[firstRow["Client"]];
      if (!client) {
        console.error(
          `Client "${firstRow["Client"]}" not found in clients.yml`,
        );
        process.exit(1);
      }
      invoice.bill_to = client;
      const slug = firstRow["Client"].replace(/[^A-Za-z0-9]/g, "");
      invoiceSave = join("archive", `invoice-${invoiceNumber}-${slug}.`);
    }

    const hourlyRateCents = client.rate * 100;
    const rawHours = group.reduce(
      (sum, r) => sum + durationToFloat(r["Duration"]),
      0,
    );
    const roundedHours = roundNumber(parseFloat(rawHours.toFixed(2)));
    const amountCents = Math.round(hourlyRateCents * roundedHours);
    const project = firstRow["Project"];
    if (!project) {
      throw new Error(`Row with description "${firstRow["Description"]}" is missing a Project value`);
    }

    totalCents += amountCents;
    invoice.lineItems.push({
      description: `${project}: ${firstRow["Description"]}`,
      startDate: firstRow["Start date"],
      roundedHours,
      rate: formatMoney(hourlyRateCents),
      amount: formatMoney(amountCents),
    });
    invoice.summary[project] = (invoice.summary[project] || 0) + amountCents;
  }

  // Append recurring expenses
  for (const item of config.recurring_expenses || []) {
    if (!item.name) throw new Error("A recurring_expense entry is missing a name");
    if (!item.amount) throw new Error(`Recurring expense "${item.name}" is missing an amount`);
    if (!item.category) throw new Error(`Recurring expense "${item.name}" is missing a category`);
    const amountCents = item.amount * 100;
    totalCents += amountCents;
    const lastItem = invoice.lineItems[invoice.lineItems.length - 1];
    invoice.lineItems.push({
      description: item.name,
      startDate: lastItem?.startDate ?? "",
      roundedHours: 1,
      rate: formatMoney(amountCents),
      amount: formatMoney(amountCents),
    });
    invoice.summary[item.category] = (invoice.summary[item.category] || 0) + amountCents;
  }

  invoice.total_amount = formatMoney(totalCents);
  invoice.summary = Object.entries(invoice.summary).map(([project, cents]) => ({
    project,
    amount: formatMoney(cents),
  }));

  mkdirSync("archive", { recursive: true });

  const printer = new PdfPrinter(FONTS);
  const doc = printer.createPdfKitDocument(buildDocDefinition(invoice));
  const pdfPath = invoiceSave + "pdf";
  doc.pipe(createWriteStream(pdfPath));
  doc.end();
  await new Promise((resolve) => doc.on("end", resolve));

  console.log(`Invoice saved to ${pdfPath}`);
}

main();
