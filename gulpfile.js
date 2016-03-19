const gulp = require('gulp');
const $ = require('gulp-load-plugins')();
const del = require('del');
const path = require('path');
const mkdirp = require('mkdirp');
const isparta = require('isparta');
const nodemon = require('gulp-nodemon');
const babel = require('gulp-babel')

const Cache = require('gulp-file-cache')

const manifest = require('./package.json');
const config = manifest.nodeBoilerplateOptions;
const mainFile = manifest.main;
const destinationFolder = path.dirname(mainFile);

var cache = new Cache()

// Remove the built files
// gulp.task('clean', function cleanTask(cb) {
//   del([destinationFolder], cb)
// })
gulp.task('default', ['watch'])

gulp.task('test', ['buildTests'], function testTask() {
  return nodemon({
    script: 'test_dist/index.js',
    watch: 'test',
    tasks: ['buildTests'],
  })
})

gulp.task('buildTests', function buildTestsTask() {
  return gulp.src('./test/**/*.js')
    .pipe(cache.filter())
    .pipe(babel())
    .pipe(cache.cache())
    .pipe(gulp.dest('./test_dist'))
})

gulp.task('build', function buildTask() {
  return gulp.src('./src/**/*.js')
    .pipe(cache.filter())
    .pipe(babel({presets:['es2015','stage-0']}))
    .pipe(cache.cache())
    .pipe(gulp.dest('./dist'))
})

gulp.task('watch', ['build'], function watchTask() {
  return nodemon({
    script: 'dist/index.js',
    watch: 'src',
    tasks: ['build'],
  })
})

// Send a notification when JSHint fails,
// so that you know your changes didn't build
// function jshintNotify(file) {
//   if (!file.jshint) { return; }
//   return file.jshint.success ? false : 'JSHint failed';
// }

// function jscsNotify(file) {
//   if (!file.jscs) { return; }
//   return file.jscs.success ? false : 'JSCS failed';
// }

// function createLintTask(taskName, files) {
//   gulp.task(taskName, function() {
//     return gulp.src(files)
//       .pipe($.plumber())
//       .pipe($.jshint())
//       .pipe($.jshint.reporter('jshint-stylish'))
//       .pipe($.notify(jshintNotify))
//       .pipe($.jscs())
//       .pipe($.notify(jscsNotify))
//       .pipe($.jshint.reporter('fail'));
//   });
// }

// // Lint our source code
// createLintTask('lint-src', ['src/**/*.js'])

// // Lint our test code
// createLintTask('lint-test', ['test/**/*.js'])

// // Build two versions of the library
// // gulp.task('build', ['lint-src', 'clean'], function() {
// gulp.task('build', ['clean'], function() {

//   // Create our output directory
//   // mkdirp.sync(destinationFolder);
//   return gulp.src('src/**/*.js')
//     .pipe($.plumber())
//     .pipe($.babel({ blacklist: ['useStrict'] }))
//     .pipe(gulp.dest(destinationFolder));
// });

// function test() {
//   return gulp.src(['test/setup/node.js', 'test/unit/**/*.js'], {read: false})
//     .pipe($.plumber())
//     .pipe($.mocha({reporter: 'dot', globals: config.mochaGlobals}));
// }

// // Make babel preprocess the scripts the user tries to import from here on.
// require('babel/register');

// gulp.task('coverage', function(done) {
//   gulp.src(['src/*.js'])
//     .pipe($.plumber())
//     .pipe($.istanbul({ instrumenter: isparta.Instrumenter }))
//     .pipe($.istanbul.hookRequire())
//     .on('finish', function() {
//       return test()
//       .pipe($.istanbul.writeReports())
//       .on('end', done);
//     });
// });


// // Lint and run our tests
// // gulp.task('test', ['lint-src', 'lint-test'], test);
// // gulp.task('test', test);

// // Run the headless unit tests as you make changes.
// // gulp.task('watch', ['test'], function() {
// gulp.task('watch', ['build'], function() {
//   gulp.watch(['src/**/*', 'test/**/*', 'package.json', '**/.jshintrc', '.jscsrc'], ['build']);
// });

// // An alias of serve
// gulp.task('default', ['serve'])

// gulp.task('serve', ['watch'], () => {
//   return nodemon({
//     script: 'dist/server.js',
//     watch: ['dist'],
//   })
// })
