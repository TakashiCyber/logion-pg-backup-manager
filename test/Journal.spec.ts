import { DateTime } from "luxon";
import { BackupFile, BackupFileName, Journal } from "../src/Journal";

describe("BackupFileName", () => {

    it("parses full backup file name", () => {
        const dateTime = DateTime.now();
        const fileName = BackupFileName.parse(`${dateTime.toISO()}-full.sql.enc`);
        expect(fileName.date).toEqual(dateTime);
        expect(fileName.type).toEqual('FULL');
    });

    it("parses delta backup file name", () => {
        const dateTime = DateTime.now();
        const fileName = BackupFileName.parse(`${dateTime.toISO()}-delta.sql.enc`);
        expect(fileName.date).toEqual(dateTime);
        expect(fileName.type).toEqual('DELTA');
    });

    it("generates full backup file name", () => {
        const date = DateTime.now();
        const backupFileName = new BackupFileName({
            date,
            type: 'FULL'
        });
        expect(backupFileName.fileName).toBe(`${date.toISO()}-full.sql.enc`);
    });

    it("generates delta backup file name", () => {
        const date = DateTime.now();
        const backupFileName = new BackupFileName({
            date,
            type: 'DELTA'
        });
        expect(backupFileName.fileName).toBe(`${date.toISO()}-delta.sql.enc`);
    });
});

describe("Journal", () => {

    it("is empty with empty file", async () => {
        const journal = await Journal.read("test/empty.txt");
        expect(journal.isEmpty()).toBe(true);
    });

    it("contains expected entries", async () => {
        const journal = await Journal.read("test/journal.txt");
        expect(journal.isEmpty()).toBe(false);

        const expectedBackupFiles = [
            new BackupFile({
                cid: "cid0",
                fileName: BackupFileName.getFullBackupFileName(DateTime.fromISO("2022-04-07T14:56:14.326+02:00"))
            }),
            new BackupFile({
                cid: "cid1",
                fileName: BackupFileName.getDeltaBackupFileName(DateTime.fromISO("2022-04-07T14:57:14.326+02:00"))
            }),
            new BackupFile({
                cid: "cid2",
                fileName: BackupFileName.getFullBackupFileName(DateTime.fromISO("2022-04-07T14:58:14.326+02:00"))
            })
        ];

        let i = 0;
        for(const backupFile of journal) {
            expect(backupFile).toEqual(expectedBackupFiles[i]);
            ++i;
        }
    });

    it("finds last full backup", async () => {
        const journal = await Journal.read("test/journal.txt");
        expect(journal.isEmpty()).toBe(false);

        const expectedBackupFile = new BackupFile({
            cid: "cid2",
            fileName: BackupFileName.getFullBackupFileName(DateTime.fromISO("2022-04-07T14:58:14.326+02:00"))
        });

        expect(journal.getLastFullBackup()).toEqual(expectedBackupFile);
    });
});
