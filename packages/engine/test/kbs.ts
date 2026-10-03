// The real knowledge base in both profiles, built exactly as the bundler builds it.
import { indexKnowledgeBase, type KnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";

export const dev: KnowledgeBase = indexKnowledgeBase(rawChunksFromDisk("dev"));
export const release: KnowledgeBase = indexKnowledgeBase(rawChunksFromDisk("release"));
