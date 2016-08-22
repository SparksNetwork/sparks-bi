import fs from 'fs'
import rm from 'remove-markdown'
import {trim, T} from 'ramda'

export default function Release({server, slack}) {
  /**
  * CircleCI will post to this route when a release happens
  *
  * TODO: Make this generic
  */
  server.post('/release', function(req, res, next) {
    const {stage, name, branch, version} = req.body
    const changelog = req.files.changelog

    if (changelog) {
      fs.readFile(changelog.path, 'utf8', (err, data) => {
        fs.unlink(changelog.path, T)

        const releases = data.toString().split(/<a name.*<\/a>/)
        const release = rm(trim(releases[1]))
        const changelogUrl = `https://github.com/SparksNetwork/sparks-backend/blob/v${version}/CHANGELOG.md`

        slack.chat.postMessage(
          '#z-dev',
          `${name} version ${version} released to ${stage}`,
          {
            as_user: true,
            attachments: [
              {
                text: 'ok',
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
              },
              {
                title: 'Changelog',
                title_link: changelogUrl,
                text: release,
              },
            ],
          }
        )
      })
    }

    res.send({ok: true})
    next()
  })
}
