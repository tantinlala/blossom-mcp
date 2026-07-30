/* istanbul ignore file */

import * as fs from "fs/promises";
import * as fsSync from "fs";

class FileIO {
    public writeFile = async (filepath: string, text: string) => {
        await fs.writeFile(filepath, text);
    };
    public readFile = async (filepath: string, encoding?: BufferEncoding): Promise<string | Buffer> => {
        return encoding ? await fs.readFile(filepath, encoding) : await fs.readFile(filepath);
    };
    public readFileSync = fsSync.readFileSync;
    public exists = async (filepath: string): Promise<boolean> => {
        return await fs
            .access(filepath)
            .then(() => true)
            .catch(() => false);
    };
    public existsSync = fsSync.existsSync;
    public readdir = async (filepath: string): Promise<string[]> => {
        return await fs.readdir(filepath);
    };
    public unlink = async (filepath: string) => {
        await fs.unlink(filepath);
    };
    public mkdir = async (filepath: string) => {
        await fs.mkdir(filepath);
    };
    public mkdirSync = fsSync.mkdirSync;
}

export { FileIO };
