// The knowledge base's display function (`kb.zh`) as the interface formatter sees it. The knowledge provider sits above the language routes and provides it; the i18n provider, below them,
// reads it. A module of its own so that neither imports the other.
import { createContext } from "react";

export const identity = (text: string): string => text;
/** Chinese text of the data → text for display in the page's script. The identity until a Simplified knowledge base is ready. */
export const DisplayContext = createContext<(text: string) => string>(identity);
