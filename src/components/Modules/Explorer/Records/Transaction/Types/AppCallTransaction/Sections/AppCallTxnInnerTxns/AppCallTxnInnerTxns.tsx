import './AppCallTxnInnerTxns.scss';
import React, {useState} from "react";
import {A_Asset, A_SearchTransaction, A_SearchTransactionInner} from "../../../../../../../../../packages/core-sdk/types";
import {CoreTransaction} from "../../../../../../../../../packages/core-sdk/classes/core/CoreTransaction";
import LinkToAccount from "../../../../../../Common/Links/LinkToAccount";
import {TXN_TYPES} from "../../../../../../../../../packages/core-sdk/constants";
import LinkToApplication from "../../../../../../Common/Links/LinkToApplication";
import SvgIcon, {SvgIconProps} from '@mui/material/SvgIcon';
import { alpha, styled } from '@mui/material/styles';
import TreeView from '@mui/lab/TreeView';
import TreeItem, {treeItemClasses } from '@mui/lab/TreeItem';
import {ArrowForward} from "@mui/icons-material";
import {
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle
} from "@mui/material";
import InnerTransaction from "../../../../InnerTransaction/InnerTransaction";
import {AssetClient} from "../../../../../../../../../packages/core-sdk/clients/assetClient";
import explorer from "../../../../../../../../../utils/dappflow";
import CloseIcon from "@mui/icons-material/Close";

export function MinusSquare(props: SvgIconProps) {
    return (
        <SvgIcon fontSize="inherit" style={{ width: 14, height: 14 }} {...props}>
            {/* tslint:disable-next-line: max-line-length */}
            <path d="M22.047 22.074v0 0-20.147 0h-20.12v0 20.147 0h20.12zM22.047 24h-20.12q-.803 0-1.365-.562t-.562-1.365v-20.147q0-.776.562-1.351t1.365-.575h20.147q.776 0 1.351.575t.575 1.351v20.147q0 .803-.575 1.365t-1.378.562v0zM17.873 11.023h-11.826q-.375 0-.669.281t-.294.682v0q0 .401.294 .682t.669.281h11.826q.375 0 .669-.281t.294-.682v0q0-.401-.294-.682t-.669-.281z" />
        </SvgIcon>
    );
}

export function PlusSquare(props: SvgIconProps) {
    return (
        <SvgIcon fontSize="inherit" style={{ width: 14, height: 14 }} {...props}>
            <path d="M22.047 22.074v0 0-20.147 0h-20.12v0 20.147 0h20.12zM22.047 24h-20.12q-.803 0-1.365-.562t-.562-1.365v-20.147q0-.776.562-1.351t1.365-.575h20.147q.776 0 1.351.575t.575 1.351v20.147q0 .803-.575 1.365t-1.378.562v0zM17.873 12.977h-4.923v4.896q0 .401-.281.682t-.682.281v0q-.375 0-.669-.281t-.294-.682v-4.896h-4.923q-.401 0-.682-.294t-.281-.669v0q0-.401.281-.682t.682-.281h4.923v-4.896q0-.401.294-.682t.669-.281v0q.401 0 .682.281t.281.682v4.896h4.923q.401 0 .682.281t.281.682v0q0 .375-.281.669t-.682.294z" />
        </SvgIcon>
    );
}

export function CloseSquare(props: SvgIconProps) {
    return (
        <SvgIcon
            className="close"
            fontSize="inherit"
            style={{ width: 14, height: 14 }}
            {...props}
        >
            <path d="M17.485 17.512q-.281.281-.682.281t-.696-.268l-4.12-4.147-4.12 4.147q-.294.268-.696.268t-.682-.281-.281-.682.294-.669l4.12-4.147-4.12-4.147q-.294-.268-.294-.669t.281-.682.682-.281.696 .268l4.12 4.147 4.12-4.147q.294-.268.696-.268t.682.281 .281.669-.294.682l-4.12 4.147 4.12 4.147q.294.268 .294.669t-.281.682zM22.047 22.074v0 0-20.147 0h-20.12v0 20.147 0h20.12zM22.047 24h-20.12q-.803 0-1.365-.562t-.562-1.365v-20.147q0-.776.562-1.351t1.365-.575h20.147q.776 0 1.351.575t.575 1.351v20.147q0 .803-.575 1.365t-1.378.562v0z" />
        </SvgIcon>
    );
}

interface AppCallTxnInnerTxnsState{
    showTxn: boolean,
    innerTxn?: A_SearchTransactionInner,
    asset?: A_Asset
}
const initialState: AppCallTxnInnerTxnsState = {
    showTxn: false
};

function AppCallTxnInnerTxns(props): JSX.Element {

    let transaction: A_SearchTransaction = props.transaction;
    let counter = -2;

    const [
        {showTxn, innerTxn, asset},
        setState
    ] = useState(initialState);

    const clearState = () => {
        setState({ ...initialState });
    };

    function handleClose() {
        clearState();
    }

    const StyledTreeItem = styled((props: any) => {

            const {
                txn,
                nodeId
            } = props;

            const txnInstance = new CoreTransaction(txn);

            const to = txnInstance.getTo();
            const type = txnInstance.getType();
            const appId = txnInstance.getAppId();

        return <TreeItem {...props} ContentProps={{style:{borderRadius: "10px"}}} label={<div className="txn-row">
                {nodeId === '-1' ? 'Current transaction' : <div>
            <span className="item type">
            {txnInstance.getTypeDisplayValue()}

                <Chip color={"primary"} variant={"filled"} style={{marginLeft: 10}} label="View" size={"small"} onClick={async (ev) => {
                    if (txnInstance.getType() === TXN_TYPES.ASSET_TRANSFER) {
                        const assetClient = new AssetClient(explorer.network);
                        const asset = await assetClient.get(txnInstance.getAssetId());
                        setState(prevState => ({...prevState, innerTxn: txn, asset}));
                    }
                    setState(prevState => ({...prevState, innerTxn: txn, showTxn: true}));
                    ev.stopPropagation();
                    ev.preventDefault();
                }
                }></Chip>
        </span>
                    <span className="item small"><LinkToAccount copySize="s" address={txnInstance.getFrom()} strip={30}></LinkToAccount></span>
                    <span className="item small">
            <ArrowForward fontSize={"small"} style={{verticalAlign: "text-bottom", marginRight: 5}}></ArrowForward>
                        {type === TXN_TYPES.PAYMENT || type === TXN_TYPES.ASSET_TRANSFER ? <span>
                <LinkToAccount copySize="s" address={to} strip={30}></LinkToAccount>
            </span> : ''}

                        {type === TXN_TYPES.APP_CALL ? <span>
                <LinkToApplication id={appId} name={'Application: ' + appId}></LinkToApplication>
            </span> : ''}
        </span>
                </div>}
            </div>}/>;
        }

    )(({ theme }) => ({
        [`& .${treeItemClasses.iconContainer}`]: {
            '& .close': {
                opacity: 0.3,
            },
        },
        [`& .${treeItemClasses.group}`]: {
            marginLeft: 15,
            paddingLeft: 30,
            borderLeft: `1px dashed ${alpha(theme.palette.text.primary, 0.4)}`,
        }
    }));

    const renderTree = (txn) => {
        const innerTxns = txn['inner-txns'];
        counter++

        return <StyledTreeItem nodeId={counter.toString()} txn={txn} key={counter}>
            {Array.isArray(innerTxns) ? innerTxns.map((innerTxn) => renderTree(innerTxn)) : null}
        </StyledTreeItem>
    };

    return (<div className={"app-call-txn-inner-txns-wrapper"}>
        <div className={"app-call-txn-inner-txns-container"}>
            <div className="app-call-txn-inner-txns-header">
                Inner transactions
            </div>
            <div className="app-call-txn-inner-txns-body">

                <TreeView
                    defaultExpanded={['-1']}
                    defaultCollapseIcon={<MinusSquare />}
                    defaultExpandIcon={<PlusSquare />}
                    defaultEndIcon={<CloseSquare />}
                >
                    {renderTree(transaction)}
                </TreeView>

            </div>
        </div>

        {showTxn ? <Dialog
            onClose={handleClose}
            fullWidth={true}
            maxWidth={"xl"}
            open={showTxn}
        >
            <CloseIcon className="modal-close-button abs" onClick={handleClose}/>
            <DialogContent>
                <div style={{position: 'relative'}}>
                    <InnerTransaction txn={innerTxn} asset={asset}></InnerTransaction>
                </div>
            </DialogContent>
            <DialogActions>

            </DialogActions>
        </Dialog> : ''}


    </div>);
}

export default AppCallTxnInnerTxns;
