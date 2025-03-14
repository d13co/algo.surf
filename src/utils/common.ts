import copy from "copy-to-clipboard";
import { showSnack } from "../redux/common/actions/snackbar";
import { theme, shadedClr, shadedClr1, shadedClr2 } from "../theme";

export { shadedClr } from "../theme";
export { shadedClr1 } from "../theme";
export { shadedClr2 } from "../theme";

export function microalgosToAlgos(n) {
  return n / 1e6;
}

export function copyContent(ev, dispatch, content: string, message: string) {
  copy(content, {
    message: "Press #{key} to copy",
  });
  ev.preventDefault();
  ev.stopPropagation();
  dispatch(
    showSnack({
      severity: "success",
      message,
    })
  );
}

export function isNumber(n: any) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

export function exportData(data: JSON, name: string = "data.json") {
  const jsonString = `data:text/json;chatset=utf-8,${encodeURIComponent(
    JSON.stringify(data)
  )}`;
  const link = document.createElement("a");
  link.href = jsonString;
  link.download = name;
  link.click();
}

const SECOND = 1;
const MINUTE = SECOND * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const MONTH = DAY * 30;
const YEAR = DAY * 365;

export function shortDuration(from: number, to: number): string {
  const difference = to - from;
  const order: [string, number][] = [
    ["yr", Math.floor(difference / YEAR) ],
    ["mo", Math.floor((difference % YEAR) / MONTH) ],
    ["D", Math.floor((difference % MONTH) / DAY) ],
    ["H", Math.floor((difference % DAY) / HOUR)],
    ["min", Math.floor((difference % HOUR) / MINUTE)],
    ["sec", Math.floor((difference % MINUTE) / SECOND)],
  ];
  let used = 0;
  const str = [];
  for (const [pref, value] of order) {
    if (value > 0) {
      str.push(`${value} ${pref}`);
    }
  }
  return str.slice(0, 2).join(', ');
}
