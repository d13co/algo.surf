import React, { useEffect } from "react";
import "./Explorer.scss";
import { useDispatch } from "react-redux";
import { initLivedata } from "../../../../redux/explorer/actions/liveData";
import { loadAddressBook } from "../../../../redux/explorer/actions/addressBook";
import Header from "../Header/Header";

function Explorer({ children }: { children: React.ReactNode }): JSX.Element {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(initLivedata());
    dispatch(loadAddressBook());
  }, []);

  return (
    <div className="explorer-root">
      <Header></Header>
      {children}
    </div>
  );
}

export default Explorer;