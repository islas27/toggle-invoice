# toggl-invoice

CLI tool that reads a Toggl CSV export and generates a PDF invoice using pdfmake.

## Status

Active JS rewrite of the original Ruby script (`toggl-invoice.rb`). The JS version (`toggl-invoice.js`) is the one in use. The Ruby files are kept for reference only.

## Running

```bash
node toggl-invoice.js <path-to-csv>
# or, if linked via npm bin:
toggl-invoice <path-to-csv>
```

Output PDF is written to `archive/invoice-<YYYYMMDD>-<ClientSlug>.pdf`.

## Setup

```bash
npm install
cp config/config.yml.example config/config.yml
cp config/clients.yml.example config/clients.yml
```

Then edit both YAML files before running.

## Config files (gitignored)

### `config/config.yml`

```yaml
company:
  name: 'My Company'
  email: 'me@example.com'
  street: '123 Main St'
  locality: 'City, ST 00000'

bank:
  enabled: true
  name: 'BANK NAME'
  swift_number: 'SWIFT'
  account_number: '12345'
  recipient_name: 'FULL NAME'
  recipient_address1: '123 Main St'
  recipient_address2: 'City, ST, USA. Zip 00000'

recurring_expenses:
  - name: 'Service Fee'
    amount: 25          # dollars (not cents)
    category: 'Expenses' # required — used as the summary group label
```

### `config/clients.yml`

```yaml
Initech:          # must exactly match the Client column in the Toggl CSV
  name: 'Initech, Inc.'
  street: '123 N Main St'
  locality: 'Memphis, TN 38112'
  rate: 155       # hourly rate in dollars
```

## CSV format

Use Toggl's **Detailed** report export (not Summary). Required columns:

- `Client` — must match a key in `clients.yml`
- `Project` — used as the line item group label
- `Description` — rows with the same description are merged and their durations summed
- `Duration` — accepts `H:MM:SS` or `MM:SS min` formats
- `Start date` — shown on the line item

## Key behaviors

- **No defaults** — missing `Client` or `Project` in a CSV row throws an error. Missing required fields in `recurring_expenses` also throw.
- **Hour rounding** — raw hours are rounded to the nearest 0.5, with a floor of 0.5.
- **Multi-client CSVs are not supported** — client is read from the first row; all rows are billed to that client.
- **Summary groups** — line items are grouped by `Project`; recurring expenses are grouped by their `category`.

## Dependencies

| Package | Purpose |
|---|---|
| `csv-parse` | Parse Toggl CSV exports |
| `js-yaml` | Load YAML config files |
| `pdfmake` | Generate the PDF invoice |
