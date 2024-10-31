import { theme } from '../../../../../theme/index';
import {Box, styled} from "@mui/material";
import { SearchX } from 'lucide-react';

function CustomNoRowsOverlay(label = "rows") {
    return function() {
        const StyledGridOverlay = styled('div')(({theme}) => ({
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: theme.palette.primary.main,
        }));

        return (
            <StyledGridOverlay>
                <SearchX color={theme.palette.primary.dark} size={48} />
                <Box sx={{mt: 1}}>No {label}</Box>
            </StyledGridOverlay>
        );
    }
}

export default CustomNoRowsOverlay;
