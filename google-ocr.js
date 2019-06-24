const stream = require("stream");
const fs = require("fs-extra");
const path = require("path");
const readline = require("readline");

const { google } = require("googleapis");

const TOKEN_PATH = path.join(__dirname, "token.json");

class gOCR {
	constructor(fileHash, lang) {
		this.fileHash = fileHash;
		this.auth = null;
		this.drive = null;
		this.tmpFolderId = null;
		this.ocrLang = lang;
	}

	init = async () => {
		if (!fs.existsSync(path.join(__dirname, "credentials.json")))
			throw "credentials.json not found! Please check the README for instructions.";

		const creds = await fs.readJSON(path.join(__dirname, "credentials.json"));
		const { client_secret, client_id, redirect_uris } = creds.installed;

		const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

		this.auth = await new Promise((resolve) => {
			fs.readFile(TOKEN_PATH)
				.then((token) => {
					oAuth2Client.setCredentials(JSON.parse(token));
					resolve(oAuth2Client);
				})
				.catch(async () => {
					await this._getAccessToken(oAuth2Client, resolve);
				});
		});
		this.drive = google.drive({ version: "v3", auth: this.auth });

		// check if file exists
		let list = await this.drive.files.list({
			q: "name = 'ocr-video_tmp." + this.fileHash + "' and mimeType = 'application/vnd.google-apps.folder'",
			fields: "files"
		});

		let file;
		let lastFrame = -1;

		if (list.data.files.length) {
			// folder already exists
			this.tmpFolderId = list.data.files[0].id;

			// get the latest frame uploaded
			let latestFrameFiles = await this.drive.files.list({
				q: "mimeType = 'application/vnd.google-apps.document' and '" + list.data.files[0].id + "' in parents",
				orderBy: "name desc",
				fields: "files"
			});

			if (latestFrameFiles.data.files.length) {
				let latestVerifiedFrameFiles = latestFrameFiles.data.files.filter((f) => f.name.match(/^^tmp_\d{6}$$/));
				if (latestVerifiedFrameFiles.length)
					lastFrame = parseInt(latestVerifiedFrameFiles[0].name.substr(4), 10);
			}
		} else
			this.tmpFolderId = (await this.drive.files.create({
				resource: {
					name: "ocr-video_tmp." + this.fileHash,
					mimeType: "application/vnd.google-apps.folder"
				},
				fields: "id"
			})).data.id;

		return lastFrame;
	};

	OCRImage = async (filePath, exists) => {
		// Upload image
		let imageFile;

		if (exists) {
			imageFile = (await this.drive.files.list({
				q:
					"name = '" +
					path.basename(filePath, ".jpg") +
					"' and mimeType = 'application/vnd.google-apps.document' and '" +
					this.tmpFolderId +
					"' in parents",
				fields: "files"
			})).data.files[0].id;
		} else
			imageFile = (await this.drive.files.create({
				resource: {
					name: path.basename(filePath),
					mimeType: "application/vnd.google-apps.document",
					parents: [this.tmpFolderId]
				},
				media: {
					mimeType: "image/jpeg",
					body: fs.createReadStream(filePath)
				},
				ocrLanguage: this.ocrLang,
				fields: "id"
			})).data.id;

		let string = await new Promise((resolve) => {
			this.drive.files.export(
				{
					fileId: imageFile,
					mimeType: "text/plain"
				},
				(err, resp) => {
					if (err) console.log(err);

					resolve(resp.data);
				}
			);
		});

		console.log(string);

		return string.substr(21);
	};

	_getAccessToken = async (oAuth2Client, cb) => {
		const authUrl = oAuth2Client.generateAuthUrl({
			access_type: "offline",
			scope: ["https://www.googleapis.com/auth/drive"]
		});
		console.log("I need access to GDrive to be able to do OCR. Authorize me by visiting this url:", authUrl);
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});
		rl.question("Enter the code from that page here: ", (code) => {
			rl.close();
			oAuth2Client.getToken(code, (err, token) => {
				if (err) return console.error("Error retrieving access token", err);
				oAuth2Client.setCredentials(token);
				// Store the token to disk for later program executions
				fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
					if (err) return console.error(err);
					console.log("Token stored to", TOKEN_PATH);
				});
				cb(oAuth2Client);
			});
		});
	};
}

module.exports = gOCR;
