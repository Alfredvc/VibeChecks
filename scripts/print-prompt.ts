import { buildPrompt } from '../src/prompt';

const instructions = "instructions";
const sourceCode = "source code";
const filePath = "file path";
const languageId = "language";

console.log(buildPrompt(instructions, sourceCode, filePath, languageId));