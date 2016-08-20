import {keys, merge} from 'ramda'

function objectsToList(objects) {
  return keys(objects).map(key => objects[key])
}

function createStorage(config) {
  const {fb, prefix = 'botkit'} = config
  const getRef = name => fb.child(`${prefix}${name}`)

  const teamsRef = getRef('Teams')
  const usersRef = getRef('Users')
  const channelsRef = getRef('Channels')

  const makeStore = name => {
    const tName = name.slice(0,1).toUpperCase() + name.slice(1)
    const ref = getRef(tName)
    const get = id => ref.child(id).once('value')
      .then(s => s.val())

    return {
      get: function(id, cb) {
        ref.child(id).once('value')
          .then(s => cb(null, s.val()))
          .catch(err => cb(err))
      },
      save: function(data, cb) {
        const cref = ref.child(data.id)
        cref.transaction(current => {
          if (current) {
            return merge(current, data)
          } else {
            return data
          }
        })
        .then(() => cb(null))
        .catch(err => cb(err))
      },
      all: function(cb) {
        getRef(tName).once('value')
          .then(s => cb(null, objectsToList(s.val())))
          .catch(err => cb(err))
      },
    }
  }

  const storage = {
    teams: makeStore('teams'),
    users: makeStore('users'),
    channels: makeStore('channels'),
  }

  return storage
}

export {createStorage}
