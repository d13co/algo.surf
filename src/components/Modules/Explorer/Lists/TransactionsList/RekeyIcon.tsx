import { Tooltip } from "@mui/material";
import { KeyRound } from 'lucide-react';
import "./RekeyIcon.scss";

export default function RekeyIcon() {
    return <Tooltip title="Rekey transaction">
        <div className="rekey-icon">
            <KeyRound size={14} strokeWidth={1.75} />
        </div>
    </Tooltip>
}
