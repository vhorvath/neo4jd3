'use strict';

var gulp = require('gulp'),
    runSequence = require('run-sequence');

gulp.task('default', function(callback) {
    runSequence('clean', 'node_modules', 'images', 'scripts', 'styles', 'connect', 'watch', callback);
});
