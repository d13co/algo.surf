import "./AccountOptedApplications.scss";
import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../../../../../../redux/store";
import ApplicationsList from "../../../../Lists/ApplicationsList/ApplicationsList";
import { useNavigate, useParams } from "react-router-dom";
import CloseIcon from "@mui/icons-material/Close";
import { Dialog, DialogContent, DialogActions } from "@mui/material";
import LinkToAccount from "../../../../Common/Links/LinkToAccount";
import LinkToApplication from "../../../../Common/Links/LinkToApplication";
import ApplicationLocalState from "../../../Application/Sections/ApplicationLocalState/ApplicationLocalState";

function AccountOptedApplications(): JSX.Element {
  const account = useSelector((state: RootState) => state.account);
  const { optedApplications } = account;
  const { id } = useParams();
  const navigate = useNavigate();
  
  const handleClose = () => {
    const dest = window.location.pathname.replace('/'+id, '');
    navigate(dest)
  }
  
  const localState = useMemo(() => {
    return account.information["apps-local-state"].find(({id: i}) => i === Number(id));
  }, [id, account.information["apps-local-state"]])

  return (
    <>
      <div className={"account-opted-applications-wrapper"}>
        <div className={"account-opted-applications-container"}>
          <div className="account-opted-applications-body">
            <ApplicationsList
              account={account.information.address}
              applications={optedApplications}
              fields={["id", "state"]}
            ></ApplicationsList>
          </div>
        </div>
      </div>
      {id ? (
        <Dialog
          onClose={handleClose}
          fullWidth={true}
          maxWidth={"xl"}
          open={true}
        >
          <DialogContent>
            <div className="local-state-container">
                <div className="local-state-header">
                    <span>App <LinkToApplication id={id} /> Local State</span>
                    <CloseIcon className="modal-close-button" onClick={handleClose} />
                </div>
                <div className="local-state-body">
                    <div className="line">Account: <LinkToAccount address={account.information.address} copy="no" copySize="m"/></div>
                    <ApplicationLocalState state={localState} />
                </div>
            </div>
          </DialogContent>
          <DialogActions></DialogActions>
        </Dialog>
      ) : null}
    </>
  );
}

export default AccountOptedApplications;
