import rest from 'restler'

// rest.get('http://localhost:8000/presence')
// .on('complete', result => console.log(result))

rest.get('http://localhost:8000/time/pastSeven')
.on('complete', result => console.log(result))
