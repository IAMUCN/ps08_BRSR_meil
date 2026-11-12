// CSV exports are opened in spreadsheet programs, which run a cell that starts with = + - @ (or a tab or
// carriage return) as a formula. File names, org unit names and reasons are typed by users, so text that
// would be read as a formula gets a leading apostrophe and stays text. Numbers ("-12.5") are left alone.
// Pure, shared by the server's evidence bundle and the browser's exports.

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

export function csvSafeText(text: string): string {
  return FORMULA_START.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text;
}
