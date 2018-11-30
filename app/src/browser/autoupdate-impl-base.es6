import { EventEmitter } from 'events';
import https from 'https';
import { dialog, app } from 'electron';
import url from 'url';
import { exec } from 'child_process';
var log = require('electron-log');

export default class AutoupdateImplBase extends EventEmitter {
  supportsUpdates() {
    // If we're packaged into a Snapcraft distribution, we don't need
    // autoupdates within the app because they're handled transparently.
    if (process.env.SNAP) {
      return false;
    }
    return true;
  }

  /* Public: Set the feed URL where we retrieve update information. */
  setFeedURL(feedURL) {
    this.feedURL = feedURL;
    this.lastRetrievedUpdateURL = null;
  }

  emitError = error => {
    this.emit('error', error);
  };

  manuallyQueryUpdateServer(successCallback) {
    const feedHost = url.parse(this.feedURL).hostname;
    const feedPath = this.feedURL.split(feedHost).pop();

    // Hit the feed URL ourselves and see if an update is available.
    // On linux we can't autoupdate, but we can still show the "update available" bar.
    https
      .get(
        {
          host: feedHost,
          path: feedPath,
        },
        res => {
          console.log(`Manual update check (${feedHost}${feedPath}) returned ${res.statusCode}`);

          if (res.statusCode === 204) {
            successCallback(false);
            return;
          }

          let data = '';
          res.on('error', this.emitError);
          res.on('data', chunk => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (!json.url) {
                this.emitError(new Error(`Autoupdater response did not include URL: ${data}`));
                return;
              }
              successCallback(json);
            } catch (err) {
              this.emitError(err);
            }
          });
        }
      )
      .on('error', this.emitError);
  }

  /* Public: Check for updates and emit events if an update is available. */
  checkForUpdates() {
    if (!this.feedURL) {
      return;
    }

    this.emit('checking-for-update');

    this.manuallyQueryUpdateServer(json => {
      if (!json) {
        this.emit('update-not-available');
        return;
      }
      this.lastRetrievedUpdateURL = json.url;
      this.emit('update-downloaded', null, 'manual-download', json.version);
    });
  }

  /* Public: Install the update. */
  quitAndInstall() {
    //shell.openExternal(this.lastRetrievedUpdateURL || 'https://getmailspring.com/download');
    doInstall();
  }
}
async function install() {
  // eslint-disable-next-line prettier/prettier
  return new Promise(function (resolve, reject) {
    exec(
      "pkexec dnf install `curl -sI https://updates.getmailspring.com/download?platform=linuxRpm | grep -oiP '(?<=location: )(.*)(?=\r)'` -y",
      (err, stdout, stderr) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            stdout,
            stderr,
          });
        }
      }
    );
  });
}

async function doInstall() {
  let { stdout } = await install().catch(err => {
    log.error('Error updating Mailspring: \n' + err.message);
    dialog.showErrorBox('Error updating Mailspring', err.message);
  });
  log.info('Updated Mailspring: \n' + stdout);
  dialog.showMessageBox('Updated Mailspring');
  app.relaunch();
  app.exit(0);
}
