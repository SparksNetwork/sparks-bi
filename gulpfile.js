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
    watch: ['test', 'dist'],
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
