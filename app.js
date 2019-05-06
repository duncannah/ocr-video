const program = require("commander");
const fs = require("fs-extra");
const path = require("path");
const md5File = require("md5-file/promise");

const ffmpeg = require("fluent-ffmpeg");

program
	.usage("[options] <file>")
	.option("--lang [code]", 'language code of language of text used in video (ISO 639-1, or "auto")', "auto")
	.option("--region [region]", "region in viewpoint to scan text (w:h:x:y)", /\d+:\d+:\d+:\d+/, "1920:270:0:810")
	.option("--ffmpeg-path [path]", "path to FFMPEG")
	.parse(process.argv);

(async () => {
	if (!program.args.length) return console.error("Missing argument: file");

	if (program["ffmpeg-path"]) ffmpeg.setFfmpegPath = program["ffmpeg-path"];

	let fileMD5 = await md5File(program.args[0]);
	let tmpFolder = path.join(process.cwd(), "ocr-video_tmp." + fileMD5);

	if (!(await fs.pathExists(path.join(tmpFolder, ".done")))) {
		if (await fs.pathExists(tmpFolder)) {
			console.log("Incomplete frame extration found, starting over");
			await fs.emptyDir(tmpFolder);
		} else await fs.mkdir(tmpFolder);

		console.log("Seperating video into frames...");

		await new Promise((resolve, reject) => {
			ffmpeg(program.args[0])
				.fps(1)
				.videoFilters("crop=" + program.region)
				//.videoFilters("negate")
				.output(path.join(tmpFolder, "tmp_%06d.jpg"))
				.on("progress", (progress) => {
					process.stdout.clearLine();
					process.stdout.cursorTo(0);
					process.stdout.write(Math.min(100, Math.round(progress.percent)) + "% done...");
				})
				.on("end", () => {
					process.stdout.write("\n");
					resolve();
				})
				.on("error", (err) => {
					reject(err);
				})
				.run();
		});

		await fs.writeFile(path.join(tmpFolder, ".done"), "");
	} else console.log("Found frames, continuing...");

	const files = (await fs.readdir(tmpFolder)).filter((file) => file.match(/tmp_\d{6}\.jpg/)).sort();
	if (files.length < 2) return console.error("No frames found in folder, something has gone wrong...");

	console.log("Initializing OCR...");
	const gOCR = new (require("./google-ocr"))(fileMD5, program.lang !== "auto" ? program.lang : undefined);
	await gOCR.init();

	console.log("OCR scanning...");

	const strings = [];

	for (const [index, file] of files.entries()) {
		strings.push(await gOCR.OCRImage(path.join(tmpFolder, file)));

		process.stdout.clearLine();
		process.stdout.cursorTo(0);
		process.stdout.write(
			`${Math.min(100, Math.round((index / files.length) * 100))}% done (frame #${index} of ${files.length})...`
		);
	}

	process.stdout.write("\n");

	// debeug
	//await fs.writeJSON("./test.json", strings);

	//const strings = await fs.readJSON("./test.json");

	// Create a VTT file
	let vtt = [`WEBVTT\n\n`];
	for (const [second, string] of strings.entries()) {
		if (!string.trim().length) continue;

		if (second !== 0 && strings[second - 1].trim() === string.trim()) {
			// last second string is same, stretch the time instead of adding a new entry

			vtt[vtt.length - 1 - 2] =
				vtt[vtt.length - 1 - 2].substr(0, 17) + `${new Date(second * 1000).toISOString().substr(11, 8)}.000\n`;

			continue;
		}

		vtt.push(
			`${new Date((second - 1) * 1000).toISOString().substr(11, 8)}.000 --> ${new Date(second * 1000)
				.toISOString()
				.substr(11, 8)}.000\n`
		);

		vtt.push((string || "").trim());

		vtt.push("\n\n\n");
	}

	await fs.writeFile(path.join(process.cwd(), "output.vtt"), vtt.join(""));

	console.log("Written to output.vtt");
})();
