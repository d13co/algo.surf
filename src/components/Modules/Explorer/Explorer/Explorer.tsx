import React, { useEffect } from 'react';
import './Explorer.scss';
import {useDispatch} from "react-redux";
import {initLivedata} from "../../../../redux/explorer/actions/liveData";
import {Outlet, useLocation} from "react-router-dom";
import Header from "../Header/Header";

function Explorer({ children }: { children: React.ReactNode }): JSX.Element {
  const location = useLocation();

  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(initLivedata());
  }, []);

  return (
    <div className="explorer-root">
    <Header></Header>
      {children}
    </div>
  );
}

export default Explorer;
