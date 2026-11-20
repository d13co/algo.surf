import { TealListing } from "./TealCode";

/** A program's disassembly, coloured, each op's reference on hover. */
function TealViewer({ text }: { text: string }) {
  return <TealListing text={text} className="bg-[#121212]" />;
}

export default TealViewer;
