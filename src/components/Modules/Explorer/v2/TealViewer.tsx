import { CodeBlock, tomorrowNightBright } from "react-code-blocks";

const codeTheme = {
  ...tomorrowNightBright,
  backgroundColor: "#121212",
  literalColor: "#12afac",
  builtInColor: "#12afac",
  typeColor: "#12afac",
  metaColor: "#4dc9c6",
  numberColor: "#4dc9c6",
  commentColor: "#064a49",
};

function TealViewer({ text }: { text: string }) {
  return (
    <CodeBlock
      text={text}
      theme={codeTheme}
      language="swift"
      showLineNumbers={false}
    />
  );
}

export default TealViewer;
