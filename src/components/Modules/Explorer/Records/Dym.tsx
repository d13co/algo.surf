import {Link} from "@mui/material";
import {shadedClr} from "../../../../utils/common";
import './Dym.scss';

interface DymProps {
  text: string;
  link: string;
}

export default function Dym({ text, link }: DymProps): JSX.Element {
  return <div className="dym" style={{backgroundColor: shadedClr}}>
    <div>
      Did you mean <Link href={link}>{text}?</Link>
    </div>
  </div>;
}
