import { useEffect } from 'react';

const network = process.env.REACT_APP_NETWORK ?? "";

const defaultTitle = `Ⱥ Surf ${network}`;
const defaultPrefix = `Ⱥ Surf ${network}: `;

export default function useTitle(title: string, noPrefix?: true) {
    useEffect(() => {
        const prefix = noPrefix ? "" : defaultPrefix;
        document.title = prefix + title;
        return () => { document.title = defaultTitle; }
    }, [title]);
}
