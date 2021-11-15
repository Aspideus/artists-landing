// Filesystem
const fs = require('fs'),
    filePath = require('path');

// Gulp modules
const {src, dest, watch} = require('gulp');

// Common plugins
const gulpIf = require('gulp-if'),
    concat = require('gulp-concat'),
    rename = require('gulp-rename'),
    cache = require('gulp-cache'),
    merge = require('merge-stream'),
    sourcemaps = require('gulp-sourcemaps'),
    debug = require('gulp-debug');

// Server plugins
const browserSync = require('browser-sync').create(),
    reload = browserSync.reload,
    GulpSsh = require('gulp-ssh');

// JS plugins
const bro = require('gulp-bro'),
    babelify = require('babelify'),
    uglify = require('gulp-uglify');

// Styles plugins
const sass = require('gulp-sass'),
    cssMin = require('gulp-cssnano'),
    postcss = require('gulp-postcss'),
    autoprefix = require('autoprefixer');

// HTML plugins
const pug = require('gulp-pug'),
    prettify = require('gulp-prettify');

// Images plugins
const imageMin = require('gulp-imagemin'),
    jpegCompress = require('imagemin-jpeg-recompress'),
    pngquant = require('imagemin-pngquant');

const browserify = require('browserify');

// Configurations
const isSftp = process.argv.includes('--deploy');
const sshConfig = JSON.parse(fs.readFileSync(filePath.resolve(__dirname, '.sftpconfig'), 'utf8'));

var path = {
  remote: sshConfig.path,
  src: {
    js: {
      app: 'src/js/app.js',
    },
    styles: {
      scss: 'src/scss/app.scss'
    },
    img: 'src/img/**/*.*',
    fonts: 'src/fonts/**/*.*',
  },
  dest: {
    js: 'build/js/',
    scss: 'build/css/',
    img: 'build/img/',
    fonts: 'build/fonts/'
  },
  watch: {
    styles: 'src/scss/**/*.scss',
    js: 'src/js/**/*.js',
    img: 'src/img/**/*.*',
    fonts: 'src/fonts/**/*.*'
  }
};

// Creates SSH connection
const ssh = new GulpSsh({
  ignoreErrors: true,
  sshConfig: sshConfig.connect
});

// Runs local server
function server() {
  browserSync.init({
    server: path.dest.html,
    notify: false,
    open: true,
    cors: true,
    ui: false
  });

  watcher();
}

const styles = () => {
  let tasks = Object.keys(path.src.styles).map(type => {
    let stream = src(path.src.styles[type])
        .pipe(sourcemaps.init())
        .pipe(gulpIf(type === 'scss', sass({sourcemap: true}).on('error', sass.logError)))
        .pipe(postcss([autoprefix({overrideBrowserslist: ['last 10 versions']})]))
        .pipe(cssMin({zindex: false}))
        .pipe(rename({suffix: '.min'}))
        .pipe(sourcemaps.write('./'))
        .pipe(dest(path.dest[type]));

    return isSftp ? stream.pipe(ssh.dest(path.remote + path.dest[type])) : stream;
  });

  return merge(tasks);
};

// Assembles js bundle
const js = () => {
  let tasks = Object.keys(path.src.js).map(type => {
    let stream = src(path.src.js[type])
        .pipe(sourcemaps.init())
        .pipe(bro({
          transform: [
            babelify.configure({presets: ['@babel/env']})
          ]
        }))
        .pipe(uglify())
        .pipe(rename({suffix: '.min'}))
        .pipe(sourcemaps.write('./'))
        .pipe(dest(path.dest.js));

    return isSftp ? stream.pipe(ssh.dest(path.remote + path.dest[type])) : stream;
  });

  return merge(tasks);
};

// Images compression
const image = () =>
    src(path.src.img)
        .pipe(cache(
            imageMin([
              imageMin.gifsicle({interlaced: true}),
              jpegCompress({
                progressive: true,
                max: 90,
                min: 80
              }),
              pngquant(),
              imageMin.svgo({
                plugins: [{removeViewBox: false}]
              })
            ])
        ))
        .pipe(dest(path.dest.img));


// Gulp watch task
function watcher() {
  watch(path.watch.js, js).on('change', reload);
  watch(path.watch.styles, styles).on('change', reload);
  watch(path.watch.img, image).on('change', reload);
}

exports.js = js;
exports.styles = styles;
exports.image = image;
exports.server = server;
exports.default = watcher;
