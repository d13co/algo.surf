import {createTheme} from "@mui/material";
import pSBC from 'shade-blend-color';

declare module '@mui/material/styles' {
    interface Theme {

    }
    interface ThemeOptions {

    }
}

const primaryColor = '#12afac';

export const shadedClr = pSBC(-0.82, primaryColor);
export const shadedClr1 = pSBC(-0.9, primaryColor);
export const shadedClr2 = pSBC(-0.95, primaryColor);


export const theme = createTheme({
    shape: {
        borderRadius: 10,
    },
    palette: {
        mode: 'dark',
        primary: {
            main: primaryColor
        },
        secondary: {
            main: '#f44336',
        },
    },
    typography: {
        button: {
            textTransform: 'none'
        }
    },
    components: {
        MuiPaper: {
            styleOverrides: {
                root: {
                    boxShadow: "none"
                }
            }
        },
        MuiTooltip: {
            styleOverrides: {
                tooltip: {
                    background: '#000'
                }
            }
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    borderRadius: 10
                }
            }
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    boxShadow: 'none',
                    borderRadius: 10,
                    ":hover": {
                        boxShadow: 'none',
                    }
                },
                contained: {
                    '&.black-button': {
                        background: '#000'
                    }
                },
                outlined: {
                    '&.black-button': {
                        borderColor: '#000',
                        color: '#000'
                    }
                }
            }
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    borderRadius: 15,
                    backgroundColor: shadedClr,
                    backgroundImage: "none",
                }
            }
        },
        MuiInputBase: {
            styleOverrides: {
                root: {
                    borderRadius: 10
                }
            }
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                }
            }
        },
        MuiAccordionSummary: {
            styleOverrides: {
                root: {
                    backgroundColor: shadedClr,
                },
            },
        },
        MuiAccordion: {
            styleOverrides: {
                root: {
                    '&.rounded': {
                        borderRadius: 10
                    },
                    backgroundColor: shadedClr,
                },
                region: {
                    backgroundColor: shadedClr,
                }
            }
        },
        MuiAlert: {
            styleOverrides: {
                root: {
                    borderRadius: 10
                },
                standardWarning: {
                    color: '#000'
                },
                message: {
                    flexGrow: 1,
                    display: 'flex',
                    alignItems: 'baseline',
                },
            },
        },
        MuiTabs: {
            styleOverrides: {
                root: {
                    '&.related-list': {
                        borderBottom: '1px solid #f0f0f0'
                    },
                    // '& .MuiTabs-indicator': {
                    //     display: 'flex',
                    //     justifyContent: 'center',
                    //     backgroundColor: 'transparent',
                    // },
                    // '& .MuiTabs-indicatorSpan': {
                    //     maxWidth: '70%',
                    //     width: '100%',
                    //     backgroundColor: primaryColor
                    // },
                }
            }
        }
    }
});


export const shadedWarningClr = pSBC(-0.85, theme.palette.warning.main);
