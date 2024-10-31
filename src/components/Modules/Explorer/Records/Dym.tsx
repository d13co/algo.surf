import {useCallback} from 'react';
import {Link,IconButton} from "@mui/material";
import {useSearchParams} from "react-router-dom";
import {theme,shadedWarningClr} from "../../../../theme/index";
import CloseIcon from "@mui/icons-material/Close";
import './Dym.scss';

interface DymProps {
  text: string;
  link: string;
}

const warningColor = theme.palette.warning.main;

export default function Dym({ text, link }: DymProps): JSX.Element {
  const [_, setSearchParams] = useSearchParams();

  const dismiss = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  return <div className="dym" style={{backgroundColor: shadedWarningClr, borderLeftColor: warningColor}}>
    <div>
      Did you mean <Link color={theme.palette.warning.main} href={link}>{text}?</Link>
    </div>
    <IconButton onClick={dismiss}>
      <CloseIcon />
    </IconButton>
  </div>;
}
