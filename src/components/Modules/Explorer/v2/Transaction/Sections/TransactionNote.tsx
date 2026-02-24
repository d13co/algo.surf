import React, { useState, useMemo } from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { TEXT_ENCODING } from "src/packages/core-sdk/constants";
import msgpack from "msgpack-lite";

function TransactionNote({
  transaction,
}: {
  transaction: any;
}): JSX.Element | null {
  const txnInstance = new CoreTransaction(transaction);
  const note = txnInstance.getNote();
  const txnJson = useMemo(() => txnInstance.getNoteJSON(), [note]);
  // Strict msgpack detection: decode then re-encode and verify the bytes
  // match exactly. msgpack.decode() is too lenient — it silently consumes
  // a prefix and ignores trailing junk (e.g. JSON "{" decodes as fixint 123).
  const isMsgpack = useMemo(() => {
    if (!note) return false;
    try {
      const buf = Buffer.from(note, "base64");
      const decoded = msgpack.decode(buf);
      if (decoded === null || typeof decoded !== "object") return false;
      const reEncoded = Buffer.from(msgpack.encode(decoded));
      return buf.length === reEncoded.length && buf.equals(reEncoded);
    } catch {
      return false;
    }
  }, [note]);

  const [textEncoding, setTextEncoding] = useState(
    txnJson ? TEXT_ENCODING.JSON : TEXT_ENCODING.TEXT,
  );
  const [copied, setCopied] = useState(false);

  if (!note) return null;

  const encodings = [
    ...(txnJson ? [{ label: "JSON", value: TEXT_ENCODING.JSON }] : []),
    { label: "Text", value: TEXT_ENCODING.TEXT },
    { label: "Base64", value: TEXT_ENCODING.BASE64 },
    ...(isMsgpack ? [{ label: "Msgpack", value: TEXT_ENCODING.MSG_PACK }] : []),
    { label: "Hex", value: TEXT_ENCODING.HEX },
  ];

  return (
    <div className="mt-6 rounded-lg p-5 bg-background-card">
      <div className="flex items-center flex-wrap gap-2">
        <span className="text-muted-foreground">Note</span>
        <div className="flex items-center gap-2.5 ml-auto">
          <button
            type="button"
            className="px-2.5 py-1 text-xs cursor-pointer rounded border border-border bg-transparent text-primary hover:bg-primary/20"
            onClick={() => {
              navigator.clipboard.writeText(txnInstance.getNote(textEncoding));
              setCopied(true);
              setTimeout(() => setCopied(false), 1000);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <div className="inline-flex rounded border border-border overflow-hidden text-xs">
            {encodings.map((enc) => (
              <button
                key={enc.value}
                type="button"
                className={`px-2.5 py-1 cursor-pointer border-l first:border-l-0 border-border ${
                  textEncoding === enc.value
                    ? "bg-primary text-background"
                    : "bg-transparent text-primary hover:bg-primary/20"
                }`}
                onClick={() => setTextEncoding(enc.value)}
              >
                {enc.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-5 text-[13px] break-words">
        {textEncoding === TEXT_ENCODING.JSON ? (
          <span className="whitespace-pre">
            {txnInstance.getNote(textEncoding)}
          </span>
        ) : (
          txnInstance.getNote(textEncoding)
        )}
      </div>
    </div>
  );
}

export default TransactionNote;
