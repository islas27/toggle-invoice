# Toggl-Invoice

A Node.js CLI tool that generates PDF invoices from Toggl timesheet CSV exports.

## Disclaimer

I am not affiliated in any way with Toggl, although they seem like nice folks. If you encounter a bug with this script, it's not their fault. On the other hand, if you encounter a bug with their application, it's not my fault.

For Toggl support: http://support.toggl.com/

For bugs with this script: https://github.com/RomAnoX/toggle-invoice/issues

## Requirements

- Node.js
- A Toggl account (free or paid)

## Setup

```bash
npm install
cp config/config.yml.example config/config.yml
cp config/clients.yml.example config/clients.yml
```

Edit `config/config.yml` to reflect your company and bank details, and `config/clients.yml` with your clients and their hourly rates.

## Usage

1. In Toggl, export a **Detailed** CSV report (not Summary) for the billing period.
2. Run the script:
   ```bash
   node toggl-invoice.js Toggl_time_entries.csv
   ```
3. The generated PDF is saved to the `archive/` directory.

## Config

### `config/config.yml`

Defines your company info, bank details (shown at the bottom of the invoice if `enabled: true`), and any recurring expenses to append to every invoice.

Recurring expenses require `name`, `amount` (in dollars), and `category` (the summary group label).

### `config/clients.yml`

Each key must exactly match the **Client** name in your Toggl CSV. Each entry needs `name`, `street`, `locality`, and `rate` (hourly, in dollars).

## Notes

- Use the **Detailed** report export from Toggl — the Summary report collapses everything into one line. The Detailed report gives individual intervals, which this tool merges by description and sums the durations.
- Hours are rounded to the nearest 0.5, with a minimum of 0.5.
- All rows in a single CSV must belong to the same client.
- The `Client` and `Project` columns are required on every row — the script will error rather than guess defaults.

## License

MIT License. See [LICENSE](LICENSE.md). Originally created by James Adams; JS rewrite by Jonathan Islas.
