import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { indexerModels } from "algosdk";
import { Loader2 } from "lucide-react";
import { blockQuery } from "src/hooks/useBlock";
import Link from "./Link";

export type BlockTxn = indexerModels.Transaction;

/** The section of the txn page its authorization shows in. */
export function sigAnchor(t: BlockTxn): string {
  if (t.signature?.logicsig) return "#logicsig";
  if (t.signature?.multisig) return "#multisig";
  return "";
}

/**
 * A round, for a txn surf idx knows only by its round (and maybe its index). A click loads the block,
 * picks the txn from its top-level txns and opens it at `anchor`; it opens `href` when none is picked
 * or the block fails to load. The link itself (new tab, copy) is `href`.
 */
function LinkToBlockTxn({
  round,
  pick,
  anchor = sigAnchor,
  href = `/block/${round}`,
  title,
}: {
  round: number;
  pick: (txns: BlockTxn[]) => BlockTxn | undefined;
  anchor?: (t: BlockTxn) => string;
  href?: string;
  title?: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [finding, setFinding] = useState(false);
  // A ref, not the state: two clicks before a re-render would both start.
  const busy = useRef(false);
  // Once unmounted (the user went elsewhere while the block loaded), a late navigate would hijack them.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function open(e: React.MouseEvent) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setFinding(true);
    let to = href;
    try {
      // Shares the block page's cache; never persisted (blockQuery is noPersist): a block can be MBs.
      const block = await queryClient.fetchQuery(blockQuery(round));
      const txn = pick(block.transactions ?? []);
      if (txn?.id) to = `/transaction/${txn.id}${anchor(txn)}`;
    } catch {
      // Fall back to href.
    }
    busy.current = false;
    if (!mounted.current) return;
    setFinding(false);
    navigate(to);
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Link href={href} onClick={open} title={title}>
        {round}
      </Link>
      {finding ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
    </span>
  );
}

export default LinkToBlockTxn;
