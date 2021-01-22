import fetch from 'node-fetch';
import { google } from 'googleapis';
import { imageHash } from 'image-hash';
import fs from 'fs';


import ffmpeg from 'fluent-ffmpeg';
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

ffmpeg.setFfmpegPath(ffmpegPath)

const OAuth2 = google.auth.OAuth2;
let drive = null;

initGDrive();

function initGDrive() {
  if (!process.env.GOOGLE_DRIVE_IMAGE_FOLDER) {
    console.log('Google drive forder id not set, skip Gdrive initialization.');
    return;
  }

  if (!process.env.GOOGLE_CREDENTIALS) {
    console.log('Google credentials not set, skip Gdrive initialization.');
    return;
  }

  const { token, secrets } = JSON.parse(process.env.GOOGLE_CREDENTIALS);

  // Authorize a client with the loaded credentials, then call the
  // Drive API.
  const clientSecret = secrets.installed.client_secret;
  const clientId = secrets.installed.client_id;
  const redirectUrl = secrets.installed.redirect_uris[0];
  const oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  oauth2Client.setCredentials(token);
  drive = google.drive({ version: 'v3', auth: oauth2Client });
}

export async function uploadImageFile(messageId) {

  const file = await getFile(messageId)
  const buffer = await file.buffer()

  // find hash
  const hash = await new Promise((resolve, reject) => {
    imageHash({data: buffer}, 8, true, (error, data) => {
      if (error) {
        console.log('error', error)
        reject(error)
      } else {
        resolve(data)
      }
    })
  });

  return {
    hash: hash,
    fileData: await uploadFile(messageId, hash),
  }
}


export async function uploadVideoFile(messageId) {

  const file = await getFile(messageId)

  const tmpFilename = `${new Date().getTime()}`
  const videoPath = `/tmp/${tmpFilename}`
  const fileStream = fs.createWriteStream(videoPath);

  await new Promise((resolve, reject) => {
    file.body.pipe(fileStream);
    file.body.on("error", reject);
    fileStream.on("finish", resolve);
  });

  let screenshotDir = `/tmp/${tmpFilename}.ss`

  ffmpeg({ source: videoPath }).takeScreenshots({ count: 1, timemarks: [ '00:00:06.000' ] }, screenshotDir);


  const hash = await new Promise((resolve, reject) => {

    setTimeout(() => {
      imageHash(`${screenshotDir}/tn.png`, 8, true, (error, data) => {

        if (error) {
          console.log('error', error)
          reject(error)
        } else {

          fs.unlink(videoPath, () => {})
          fs.unlink(`${screenshotDir}/tn.png`, () => {})
          fs.rmdir(screenshotDir, () => {})
          
          resolve(data)
        }
      })
    }, 500)

  });

  return {
    hash: hash,
    fileData: await uploadFile(messageId, hash),
  }

}


async function uploadFile(messageId, hash) {
  if (!drive) {
    console.log('Gdrive is not initial, skip uploading data.');
    return;
  }


  const fileMetadata = {
    name: `${hash}`,
    parents: [process.env.GOOGLE_DRIVE_IMAGE_FOLDER],
  };


  // check file exist
  const hashFile = await new Promise((resolve, reject) => {
    drive.files.list({
      q: `name='${fileMetadata.name}'`,
      fields: 'files(id, name)',
      spaces: 'drive',
      pageSize: 1,
    }, function (err, res) {
      if (err) {
        console.error('Error: ', err);
        reject(error)
      } else {
        resolve(res.data.files[0] || null)
      }

    })
  })

  console.log('###### uploadFile', hashFile)

  if (hashFile) {
    return hashFile
  }

  // upload to google drive

  const file = await getFile(messageId)

  const media = {
    mimeType: fileMetadata.mimeType,
    body: file.body,
  };

  const fileData = await new Promise((resolve, reject) => {
    drive.files.create(
      {
        resource: fileMetadata,
        media: media,
        fields: 'id',
      },
      function(err, file) {
        if (err) {
          // Handle error
          console.error('Error: ', err);
          reject(error)
        } else {
          console.log('Uploaded File Id: ', file.data.id);
          resolve(file.data)
        }
      }
    );
  })


  return fileData
}


export async function getFile(messageId) {
  const LINE_API_URL = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  const options = {
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_TOKEN}`,
    },
    method: 'GET',
  };
  const res = await fetch(LINE_API_URL, options);

  return res
}
