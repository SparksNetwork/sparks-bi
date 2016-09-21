import fs from 'fs'
import rm from 'remove-markdown'
import {trim, T, all, compose, props, complement} from 'ramda'

const channel = process.env.RELEASE_CHANNEL

export default function Release({server, slack}) {
  function readChangelogRelease(path) {
    return new Promise((resolve, reject) => {
      fs.readFile(path, 'utf8', (err, data) => {
        if (err) { return reject(err) }
        fs.unlink(path, T)
        const releases = data.toString().split(/<a name.*<\/a>/).slice(1)
        const release = rm(trim(releases[0]))

        resolve(release)
      })
    })
  }

  const lifecycles = {
    start: ({name, version, stage}) => `Started deploying ${name} ${version} to ${stage}`,
    finish: ({name, version, stage}) => `${name} version ${version} released to ${stage}`
  }

  function postMessage(details) {
    const {version, stage, branch, lifecycle, release} = details
    const message = lifecycles[lifecycle || 'finish'](details)

    const detailsAttachment = {
        fields: [
          {
            title: 'Stage',
            value: stage,
            short: true,
          },
          {
            title: 'Version',
            value: version,
            short: true,
          },
          {
            title: 'Branch',
            value: branch,
            short: true,
          },
        ],
      }

    const attachments = [detailsAttachment]

    if (release) {
      const changelogUrl = `https://github.com/SparksNetwork/sparks-backend/blob/v${version}/CHANGELOG.md`

      attachments.push({
        title: 'Changelog',
          title_link: changelogUrl,
        text: release,
      })
    }

    slack.chat.postMessage(channel, message, {as_user: true, attachments})
  }

  const validObject = properties => compose(
    all(Boolean),
    props(properties)
  )
  const invalidObject = complement(validObject)

  /**
  * CircleCI will post to this route when a release happens
  *
  * TODO: Make this generic
  */
  server.post('/release', function(req, res, next) {
    const details = req.body
    const changelog = req.files.changelog

    if (changelog) {
      readChangelogRelease(changelog.path)
        .then(release => postMessage({...details, release}))
    } else {
      postMessage(details)
    }

    res.send({ok: true})
    next()
  })
}
