import React from "react";
import ConsensusVersion from "src/components/v2/ConsensusVersion";
import { useConsensusVersionLookup } from "src/hooks/useConsensusVersions";
import { upgradeAnchor } from "src/hooks/useUpgrades";
import { surfIdxSupported } from "src/utils/surfIdx";
import Link from "../Links/Link";

/** The consensus protocol a block ran under, from its own header: no extra request. */
export default function BlockProtocol({ protocol }: { protocol: string }): JSX.Element | null {
  const lookup = useConsensusVersionLookup();
  if (!protocol) return null;
  const info = lookup(protocol);
  return (
    <div className="mt-2.5">
      <div className="text-muted-foreground">Protocol</div>
      <div className="mt-2.5 text-[13px] leading-5 flex items-start gap-3 flex-wrap">
        <ConsensusVersion info={info} showLink />
        {surfIdxSupported ? (
          <Link href={`/upgrades#${upgradeAnchor(info.name)}`} keepRound={false}>
            Upgrade history
          </Link>
        ) : null}
      </div>
    </div>
  );
}
