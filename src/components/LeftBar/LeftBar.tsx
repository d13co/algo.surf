import './LeftBar.scss';
import {
    Box,
    Button, ListItemIcon, ListItemText, Menu, MenuItem, Tab, Tabs
} from "@mui/material";
import {useDispatch, useSelector} from "react-redux";
import React from "react";
import SettingsIcon from '@mui/icons-material/Settings';
import GitHubIcon from '@mui/icons-material/GitHub';
import {showSettings} from "../../redux/settings/actions/settings";
import Logo from '../../assets/images/logo-black.png';
import {useLocation, useNavigate} from "react-router-dom";
import {RootState} from "../../redux/store";
import {shadedClr, shadedClr1, shadedClr2} from "../../utils/common";
import CodeIcon from '@mui/icons-material/Code';
import StorageIcon from '@mui/icons-material/Storage';
import GavelIcon from '@mui/icons-material/Gavel';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';
import ShowerIcon from '@mui/icons-material/Shower';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import InsertChartIcon from '@mui/icons-material/InsertChart';
import {CoreNode} from "../../packages/core-sdk/classes/core/CoreNode";
import {supportSettings} from "../../utils/nodeConfig";
import {showConnectWallet} from "../../redux/wallet/actions/connectWallet";
import ConnectWallet from "./ConnectWallet/ConnectWallet";
import {logOut} from "../../redux/wallet/actions/wallet";
import LogoutIcon from '@mui/icons-material/Logout';
import SwapCallsIcon from '@mui/icons-material/SwapCalls';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';

function LeftBar(): JSX.Element {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const liveData = useSelector((state: RootState) => state.liveData);
    const node = useSelector((state: RootState) => state.node);
    const location = useLocation();

    const wallet = useSelector((state: RootState) => state.wallet);

    const {connection} = liveData;
    let {success} = connection;
    let route = location.pathname;
    route = route.substring(1);
    route = route.split('/')[0];

    const [menuAnchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const open = Boolean(menuAnchorEl);

    const showWalletMenu = (event: any) => {
        setAnchorEl(event.currentTarget);
    };

    const closeWalletMenu = () => {
        setAnchorEl(null);
    };

  return (
      <div className="left-bar-wrapper">
          <div className="left-bar-container" style={{background: shadedClr}}>
              <div className="logo" onClick={() => {
                  navigate('/');
              }}>
                  <div className="text">
                      A<span style={{letterSpacing: '-2px'}}>.O</span>
                  </div>
              </div>

              <div className="menu-list">

                  <Tabs value={route} orientation={"vertical"} sx={{'.Mui-selected': {
                          backgroundColor: shadedClr1,
                      },
                      '.MuiButtonBase-root': {
                          minHeight: '50px',
                          borderRadius: '10px',
                          marginBottom: '10px'
                      },
                      '.MuiTabs-indicator': {
                          display: "none"
                      }
                  }}>
                      <Tab icon={<StorageIcon></StorageIcon>} iconPosition="start" label={<span className="label">Explorer</span>} value="explorer" onClick={() => {
                          navigate('/explorer');
                      }}/>
                      <Tab icon={<ShowerIcon></ShowerIcon>} iconPosition="start" label={<span className="label">Dispenser</span>} value="dispenser" onClick={() => {
                          navigate('/dispenser');
                      }}/>
                      <Tab icon={<DeveloperBoardIcon></DeveloperBoardIcon>} iconPosition="start" label={<span className="label">ABI Studio</span>} value="abi-studio" onClick={() => {
                          navigate('/abi-studio');
                      }}/>
                      <Tab icon={<CodeIcon></CodeIcon>} iconPosition="start" label={<span className="label">Developer API</span>}value="developer-api" onClick={() => {
                          navigate('/developer-api');
                      }}/>
                      <Tab icon={<GavelIcon></GavelIcon>} iconPosition="start" label={<span className="label">ARC Portal</span>} value="arc-portal" onClick={() => {
                          navigate('/arc-portal');
                      }}/>
                      <Tab icon={<InsertChartIcon></InsertChartIcon>} iconPosition="start" label={<span className="label">Node Status</span>} value="node-status" onClick={() => {
                          navigate('/node-status');
                      }}/>
                      <Tab icon={<CreditCardIcon></CreditCardIcon>} iconPosition="start" label={<span className="label">Dev Wallets</span>} value="dev-wallets" onClick={() => {
                          navigate('/dev-wallets');
                      }}/>
                  </Tabs>
              </div>
              <div className="footer">
                  <div className="bottom-menu-item-wrapper" onClick={(ev) => {
                      if (supportSettings) {
                          dispatch(showSettings());
                          ev.stopPropagation();
                          ev.preventDefault();
                      }
                  }}>
                      <div className="bottom-menu-item-container" style={{borderTopColor: shadedClr2}}>
                          <div className="node">

                              <Box className="node-url" sx={{ color: 'grey.700'}}>

                                  <div>
                                      <SettingsIcon fontSize={"small"} sx={{verticalAlign: 'middle'}} color={success ? 'primary' : 'warning'}></SettingsIcon>
                                      {success ? <span className="label">
                                  {new CoreNode(node.status, node.versionsCheck, node.genesis, node.health).getGenesisId()}
                              </span> : <span>
                                  Unable to connect</span>}
                                  </div>

                              </Box>
                          </div>
                      </div>
                  </div>

                  <div className="bottom-menu-item-wrapper">
                      <div className="bottom-menu-item-container" style={{borderTopColor: shadedClr2}}>
                          {wallet.account.address ? <div>


                              <div className="small-text" onClick={showWalletMenu}>
                                  <AccountBalanceWalletIcon fontSize="small" sx={{marginRight: '5px', verticalAlign: 'middle'}} color={"primary"}></AccountBalanceWalletIcon>
                                  {wallet.account.address}
                              </div>
                              <Menu
                                  anchorEl={menuAnchorEl}
                                  open={open}
                                  disableAutoFocusItem={true}
                                  anchorOrigin={{
                                      vertical: 'top',
                                      horizontal: 'left',
                                  }}
                                  transformOrigin={{
                                      vertical: 'top',
                                      horizontal: 'left',
                                  }}
                                  MenuListProps={{

                                  }}
                                  onClose={closeWalletMenu}>
                                  <MenuItem
                                      selected={false}
                                      onClick={(e) => {
                                          navigate('/explorer/account/' + wallet.account.address);
                                          closeWalletMenu();
                                          e.preventDefault();
                                          e.stopPropagation();
                                      }
                                      }>
                                      <ListItemIcon>
                                          <VisibilityIcon fontSize="small" color={"warning"}/>
                                      </ListItemIcon>
                                      <ListItemText sx={{fontSize: '13px'}} disableTypography>View in explorer</ListItemText>
                                  </MenuItem>
                                  <MenuItem
                                      selected={false}
                                      onClick={(e) => {
                                          dispatch(showConnectWallet());
                                          closeWalletMenu();
                                          e.preventDefault();
                                          e.stopPropagation();
                                      }
                                      }>
                                      <ListItemIcon>
                                          <SwapCallsIcon fontSize="small" color={"warning"}/>
                                      </ListItemIcon>
                                      <ListItemText sx={{fontSize: '13px'}} disableTypography>Switch wallet</ListItemText>
                                  </MenuItem>
                                  <MenuItem
                                      selected={false}
                                      onClick={(e) => {
                                          dispatch(logOut());
                                          closeWalletMenu();
                                          e.preventDefault();
                                          e.stopPropagation();
                                      }}>
                                      <ListItemIcon>
                                          <LogoutIcon fontSize="small" color={"warning"}/>
                                      </ListItemIcon>
                                      <ListItemText sx={{fontSize: '13px'}} disableTypography>Disconnect</ListItemText>
                                  </MenuItem>
                              </Menu>

                          </div> : <Button variant={"outlined"}
                                           size={"small"}
                                           className="black-button"
                                           onClick={() => {
                                               dispatch(showConnectWallet());
                                           }}
                          ><span className="label">Connect wallet</span><span className="small-label">🔌</span></Button>}

                          <ConnectWallet></ConnectWallet>
                      </div>
                  </div>

                  <div className="bottom-menu-item-wrapper">
                      <div className="bottom-menu-item-container"  onClick={() => window.open('https://github.com/d13co/algorand-observer')} style={{borderTopColor: shadedClr2}}>
                          <GitHubIcon/>
                      </div>
                  </div>

              </div>
          </div>
      </div>
  );
}

export default LeftBar;
