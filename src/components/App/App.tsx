import React, {useEffect} from 'react';
import './App.scss';
import AppRouter from "./AppRouter";
import {useDispatch} from "react-redux";
import {initApp} from "../../redux/app/actions/app";
import { useLocation } from 'react-router-dom';
import { CssBaseline } from '@mui/material';

function App(): JSX.Element {
    const dispatch = useDispatch();

    useEffect(() => {
        dispatch(initApp());
    }, []);

  return (
      <div className="app-root">
          <CssBaseline />
          <AppRouter></AppRouter>
      </div>
  );
}

export default App;
