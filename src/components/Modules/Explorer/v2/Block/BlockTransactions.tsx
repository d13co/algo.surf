import React from "react";
import { useParams } from "react-router-dom";
import TransactionsList from "../Lists/TransactionsList/TransactionsList";
import { useBlock } from "src/hooks/useBlock";
import { CoreBlock } from "src/packages/core-sdk/classes/core/CoreBlock";

function BlockTransactions(): JSX.Element {
  const { id } = useParams();
  const numId = Number(id);

  const { data: blockInfo, isLoading } = useBlock(numId);
  const transactions = blockInfo ? new CoreBlock(blockInfo).getTransactions() : [];

  return (
    <div>
      <TransactionsList
        transactions={transactions}
        initialLoading={isLoading}
        fields={["id", "from", "to", "fee", "amount", "type"]}
      />
    </div>
  );
}

export default BlockTransactions;
