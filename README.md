# ocr-video

Scans a video using Google's OCR, and outputs a VTT subtitle file.

## Dependencies

### FFmpeg

macOS: Use [Homebrew](https://brew.sh) to install FFmpeg: `brew install ffmpeg`

Linux: Use your package manager to install FFmpeg, should be labelled as `ffmpeg`

Windows: [Download binary](https://ffmpeg.zeranoe.com/builds/) and extract, then set path

_The path to the binary can be set using the `--ffmpeg-path` argument._

## Prerequisites

You'll need to create a Google API app first to authenticate.

1. Go to https://developers.google.com/drive/api/v3/quickstart/nodejs
2. Click the "ENABLE THE DRIVE API" button
3. Click the "DOWNLOAD CLIENT CONFIGURATION" button and save the file to the directory of the app.

After that, you can use the app. You'll need to only do this once. If it's your first time, you'll need to authenticate the app to access your Drive by following the instructions given by the app.

## Usage

```
Usage: ocr-video [options] <file>

Options:
  --lang [code]         language code of language of text used in video (ISO 639-1, or "auto") (default: "auto")
  --region [region]     region in viewpoint to scan text (w:h:x:y) (default: "1920:270:0:810")
  --ffmpeg-path [path]  path to FFMPEG
  -h, --help            output usage information
```

Be aware that the region argument by default only picks up the bottom quarter half of a 1920x1080 video, make sure to change if this isn't what you want.

## Doesn't Google's OCR cost money to use?

The Google Drive API (which is free to use) has an option to extract text off photos uploaded to GDrive, so we can _abuse_ that to achieve what we want. It's a bit slow, but it does the job.

## License

This software is licensed under AGPL 3.0; a copy can be found under [LICENSE](LICENSE).
