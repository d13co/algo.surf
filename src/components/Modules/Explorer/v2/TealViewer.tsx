import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";

// TEAL has no Prism grammar; Swift's gives reasonable highlighting.
SyntaxHighlighter.registerLanguage("swift", swift);

// Colors match the old react-code-blocks tomorrowNightBright theme + our teal overrides.
const color = (c: string) => ({ color: c });
const bold = { fontWeight: "bolder" };
const italic = { fontStyle: "italic" };

const codeStyle: Record<string, React.CSSProperties> = {
  'pre[class*="language-"]': {
    fontSize: "inherit",
    fontFamily: "inherit",
    background: "#121212",
    color: "#eaeaea",
    borderRadius: 3,
    display: "flex",
    lineHeight: 20 / 14,
    overflowX: "auto",
    whiteSpace: "pre",
  },
  key: { ...color("#c397d8"), ...bold },
  keyword: { ...color("#c397d8"), ...bold },
  "attr-name": color("#e7c547"),
  comment: { ...color("#064a49"), ...italic },
  "block-comment": { ...color("#064a49"), ...italic },
  "function-name": color("#7aa6da"),
  "class-name": color("#7aa6da"),
  section: color("#7aa6da"),
  title: color("#7aa6da"),
  namespace: color("#d54e53"),
  regex: color("#d54e53"),
  variable: color("#d54e53"),
  deletion: color("#d54e53"),
  builtin: color("#12afac"),
  entity: color("#12afac"),
  type: color("#12afac"),
  bullet: color("#b9ca4a"),
  addition: color("#b9ca4a"),
  symbol: color("#b9ca4a"),
  string: color("#b9ca4a"),
  url: color("#e78c45"),
  "selector-attr": color("#c397d8"),
  quote: color("#969896"),
  meta: color("#4dc9c6"),
  number: color("#4dc9c6"),
  italic,
  bold,
};

const codeTagProps = {
  style: { fontSize: "inherit", fontFamily: "inherit", lineHeight: 20 / 12, padding: 8 },
};

function TealViewer({ text }: { text: string }) {
  return (
    <SyntaxHighlighter language="swift" style={codeStyle} PreTag="span" codeTagProps={codeTagProps}>
      {text}
    </SyntaxHighlighter>
  );
}

export default TealViewer;
