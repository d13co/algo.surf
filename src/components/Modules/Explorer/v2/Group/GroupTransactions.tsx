import React from "react";
import { useParams } from "react-router-dom";
import TransactionsList from "../Lists/TransactionsList/TransactionsList";
import { useGroup } from "src/hooks/useGroup";

function GroupTransactions(): JSX.Element {
  const { id, blockId } = useParams();
  const numBlockId = Number(blockId);

  const { data: groupInfo, isLoading } = useGroup(id!, numBlockId);
  const transactions = groupInfo?.transactions ?? [];

  return (
    <div>
      <TransactionsList
        transactions={transactions}
        initialLoading={isLoading}
        record="group"
        fields={["id", "from", "to", "fee", "amount", "type"]}
      />
    </div>
  );
}

export default GroupTransactions;
