# sparks-bi

simple json rest server to consolidate data consumed by klipfolio

## config

some needs to be passed on as env vars --

* `FIREBASE_HOST`

* `FIREBASE_TOKEN`

* `TOGGL_WORKSPACE_ID`

* `SLACK_API_TOKEN` for slack presence checks

and then the rest is stored in the specified firebase --

* `/Person` - one record for each teammember.  includes fields:
    * `fullname`
    * `initials`
    * `slack_username` to link them to slack presence
    * `toggl_uid` to link them to toggl services
    * `toggl_token` api token for linking to currently-clocked task

## api calls

`/presence`

`/time/rolling`

`/time/week`

`/time/ytd`

`/pie/ytd`

