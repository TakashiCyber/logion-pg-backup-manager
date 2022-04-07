import { open } from 'fs/promises';
import { DateTime } from 'luxon';

const FULL_BACKUP_FILE_NAME_SUFFIX = "-full.sql.enc";

const DELTA_BACKUP_FILE_NAME_SUFFIX = "-delta.sql.enc";

export type BackupFileNameType = 'FULL' | 'DELTA';

export class BackupFileName {

    static getFullBackupFileName(date: DateTime): BackupFileName {
        return new BackupFileName({
            date: date,
            type: 'FULL'
        });
    }

    static getDeltaBackupFileName(date: DateTime): BackupFileName {
        return new BackupFileName({
            date: date,
            type: 'DELTA'
        });
    }

    static parse(fileName: string): BackupFileName {
        if(fileName.endsWith(FULL_BACKUP_FILE_NAME_SUFFIX)) {
            const dateString = fileName.substring(0, fileName.length - FULL_BACKUP_FILE_NAME_SUFFIX.length);
            return new BackupFileName({
                date: DateTime.fromISO(dateString),
                type: 'FULL'
            });
        } else if(fileName.endsWith(DELTA_BACKUP_FILE_NAME_SUFFIX)) {
            const dateString = fileName.substring(0, fileName.length - DELTA_BACKUP_FILE_NAME_SUFFIX.length);
            return new BackupFileName({
                date: DateTime.fromISO(dateString),
                type: 'DELTA'
            });
        } else {
            throw new Error("Bad file name format");
        }
    }

    constructor(args: {
        date: DateTime,
        type: BackupFileNameType
    }) {
        this.date = args.date;
        this.type = args.type;
    }

    readonly date: DateTime;

    readonly type: BackupFileNameType;

    get fileName(): string {
        if(this.type === 'FULL') {
            return `${this.date.toISO()}${FULL_BACKUP_FILE_NAME_SUFFIX}`;
        } else {
            return `${this.date.toISO()}${DELTA_BACKUP_FILE_NAME_SUFFIX}`;
        }
    }
}

export class BackupFile {

    constructor(args: {
        cid: string,
        fileName: BackupFileName,
    }) {
        this.cid = args.cid;
        this.fileName = args.fileName;
    }

    readonly cid: string;

    readonly fileName: BackupFileName;
}

export class Journal implements Iterable<BackupFile> {

    static async read(path: string): Promise<Journal> {
        const journal = new Journal();

        const file = await open(path, 'r');
        const content = (await file.readFile()).toString("utf-8");
        const lines = content.split(/\r?\n/);
        await file.close();

        for(const line of lines) {
            const elements = line.split(/[ \t]+/);
            if(elements.length === 2) {
                const cid = elements[0];
                const fileName = BackupFileName.parse(elements[1]);
                journal.addBackup(new BackupFile({
                    cid,
                    fileName
                }));
            }
        }

        return journal;
    }

    addBackup(backup: BackupFile) {
        this.backupFiles.push(backup);
    }

    private backupFiles: BackupFile[] = [];

    async write(path: string) {
        const file = await open(path, 'w');
        for(const backupFile of this.backupFiles) {
            await file.write(Buffer.from(`${backupFile.cid} ${backupFile.fileName.fileName}\n`, "utf-8"));
        }
        await file.close();
    }

    isEmpty(): boolean {
        return this.backupFiles.length === 0;
    }

    getLastFullBackup(): BackupFile | undefined {
        for(let i = this.backupFiles.length - 1; i >= 0; --i) {
            const backupFile = this.backupFiles[i];
            if(backupFile.fileName.type === 'FULL') {
                return backupFile;
            }
        }
        return undefined;
    }

    [Symbol.iterator](): Iterator<BackupFile, BackupFile> {
        return this.backupFiles[Symbol.iterator]();
    }
}