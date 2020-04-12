let enviroment = process.env.NODE_ENV || 'development';
// 默认文件夹配置 .tmp为临时babel编译的临时文件, mac上是隐藏文件夹, 实际打包应该为 dist 目录里面的
const folder = {
    src: 'src',
    dist: 'dist',
    temp: '.tmp'
}

const gulp = require('gulp');
const { task, dest, src, series } = require('gulp');
// ES6 转ES5
const babel = require('gulp-babel');
// 打包es6
const browserify = require('browserify');
const buffer = require('vinyl-buffer');
const stream = require('vinyl-source-stream');

// 任务流
const es = require('event-stream');
// 文件读取
const fs = require('fs');
// 读写保存配置
const fse = require("fs-extra");
const join = require('path').join;

// 生成css,js map图
const sourcemaps = require('gulp-sourcemaps');
// 错误处理
const plumber = require('gulp-plumber');
// html压缩
const htmlmin = require('gulp-htmlmin');
// 图片压缩
const imagemin = require('gulp-imagemin');
// sass 编译
const sass = require('gulp-sass');
// less 编译
const less = require('gulp-less');
const minifycss = require('gulp-clean-css');
const autoprefixer = require('gulp-autoprefixer');
// 脚本压缩
const uglify = require('gulp-uglify');
// 静态服务器
const connect = require('gulp-connect');
// 跨域代理
const proxy = require('http-proxy-middleware');
// 配合fs
const path = require("path");
// 配合watch增删改
const watch = require('gulp-watch');
// 只修改改动的文件
const changed = require('gulp-changed');
// 生成样式脚本?的引入
const md5 = require('gulp-md5-assets');
// 删除文件
const del = require('del');

// 加入二维码
const qrcode = require('qrcode-terminal');
// 用于获取本机信息
const os = require('os');
const ip = getNetwork().ip || "localhost";
// 读取配置
const package = require('./package.json');
// 起服务
var browserSync = require('browser-sync').create();
var reload = browserSync.reload;

// 获取package的项目配置,支持多个项目配置
var configName = package['projects'] && package['projects'][process.env.NODE_ENV] || 'app.json';
var app = require("./" + configName),
    // 编译服务配置
    distServer = app.distServer || {},
    // 开发服务配置
    devServer = app.devServer || {},
    // 实时刷新,仅在开发模式
    isDevLivereload = devServer.livereload == false ? false : true,
    // 实时刷新,仅在编译模式
    isDistLivereload = distServer.livereload == false ? false : true,
    // 源文件目录
    sourcePath = process.env.NODE_ENV ? process.env.NODE_ENV + '/' + folder.src : folder.src,
    // 源文件目录
    sourceBuild = process.env.NODE_ENV ? process.env.NODE_ENV + '/' + folder.dist : folder.dist;
// 源文件es5缓存目录
sourceTemp = process.env.NODE_ENV ? process.env.NODE_ENV + '/' + folder.temp : folder.temp;


// 配置编译的服务
var config = {
    source: {
        // 源文件目录
        root: sourcePath,
        // 源文件样式目录
        css: [sourcePath + "/css/**/*.css"],
        // style.css 源文件目录
        scss: [sourcePath + '/scss/**/*.scss'],
        // style.css 源文件目录
        less: [sourcePath + '/less/**/*.less', '!' + sourcePath + '/less/**/_*.less'],
        // 源文件图片目录
        images: [sourcePath + '/**/*.{png,jpg,gif,ico}'],
    },
    // 编译的输出路径
    build: sourceBuild,
    // 输出配置
    output: {
        // 输出的根目录
        root: sourceBuild,
        // 输出的样式目录
        css: sourceBuild + '/css',
        images: sourceBuild + '/'
    },
    watcher: {
        rootRule: sourcePath + '/**',
        moveRule: [sourcePath + '/**', '!' + sourcePath + '/scss'],
        jsRule: [sourcePath + '/**/*.js', '!' + sourcePath + '/js/bui.js', '!' + sourcePath + '/js/zepto.js', '!' + sourcePath + '/js/platform/**/*.js', '!' + sourcePath + '/js/plugins/**/*.js', '!' + sourcePath + '/**/*.min.js', '!' + sourcePath + '/**/*.json'],
        htmlRule: [sourcePath + '/**/*.html'],
    }
}


// 增加用户配置的忽略文件
if ("ignored" in app) {
    app.ignored.forEach(function(item, index) {
        var type = item.substr(item.lastIndexOf(".") + 1);
        switch (type) {
            case "css":
                config.source.css.push(item);
                break;
            case "scss":
                config.source.scss.push(item);
                break;
            case "less":
                config.source.less.push(item);
                break;
            case "png":
            case "jpg":
            case "gif":
            case "jpeg":
                config.source.images.push(item);
                break;
            case "js":
                config.watcher.jsRule.push(item);
                break;
            case "html":
                config.watcher.htmlRule.push(item);
                break;
            default:
                config.watcher.moveRule.push(item);
                break;
        }
    })
}

// 获取本机IP
function getNetwork() {
    let iptable = {},
        ifaces = os.networkInterfaces();

    for (let dev in ifaces) {
        ifaces[dev].forEach(function(details, alias) {
            if (details.family == 'IPv4') {
                iptable[dev + (alias ? ':' + alias : '')] = details.address;
                iptable["ip"] = details.address;
            }
        });
    }

    return iptable;
}

// 获取随机端口
function getRandomPort() {
    let random = Math.random() * 10000 + 1000;
    let randomPort = parseInt(random);

    return randomPort;
}

// 获取端口并写入配置
function getServerPort() {

    // 开发版运行端口
    let devPort = getRandomPort();
    // 编译版运行端口
    let distPort = devPort + 2;
    // 写入端口
    if (!devServer.port) {
        app.devServer.port = devPort;
        fse.writeFileSync(path.resolve(configName), JSON.stringify(app, null, 2));
    }
    if (!distServer.port) {
        app.distServer.port = distPort;
        fse.writeFileSync(path.resolve(configName), JSON.stringify(app, null, 2));
    }

    return {
        devPort: app.devServer.port,
        distPort: app.distServer.port
    }
}



// 找到文件进行打包处理
function findSync(startPath) {
    let result = []

    function finder(path) {
        let files = fs.readdirSync(path)
        files.forEach(val => {
            let fPath = join(path, val);
            let stats = fs.statSync(fPath)
            if (stats.isDirectory()) {
                finder(fPath)
            }
            if (stats.isFile() && val.lastIndexOf(".js") > -1) {
                result.push({ path: fPath, name: val, relativePath: path.substr(folder.temp.length) })
            }
        })

    }
    finder(startPath)
    let res = result.map(item => {
        item.path = item.path.replace(/\\/g, '/')
        return item
    })
    return res
}
// 转es5 部分打包平台的webview对es6不友好,譬如: async await 等
task('babel', cb => {
        let step = src(config.watcher.jsRule)
            .pipe(babel({
                presets: ['@babel/preset-env'],
                plugins: ['@babel/plugin-transform-runtime']
            }))
            .pipe(plumber({
                errorHandler: function(error) {
                    console.log(error)
                    this.emit('end');
                }
            }))
            .pipe(dest(folder.temp))
        return step;
    })
    // 转义并压缩
task('babel-mini', cb => {
        return src(config.watcher.jsRule)
            .pipe(babel({
                presets: ['@babel/preset-env'],
                plugins: ['@babel/plugin-transform-runtime']
            }))
            .pipe(plumber({
                errorHandler: function(error) {
                    console.log(error)
                    this.emit('end');
                }
            }))
            // 混淆
            .pipe(app.uglify ? uglify({
                "compress": {
                    "drop_debugger": false
                },
                "output": {
                    "max_line_len": false,
                    "comments": /^!/
                },
                "mangle": true
            }) : plumber())
            .pipe(dest(folder.temp));
    })
    // 模块化打包
task('browserify', cb => {
    let files = findSync(folder.temp)

    var task = files.map(entry => {
            return browserify({
                    entries: entry.path,
                    debug: false
                })
                .bundle()
                .on('error', function(error) {
                    console.log(error.toString())
                })
                .pipe(stream(entry.name))
                .pipe(buffer())
                .pipe(dest(folder.dist + entry.relativePath))
        })
        // 任务合并
    es.merge.apply(null, task)
    cb() //这一句其实是因为V4不再支持同步任务，所以需要以这种方式或者其他API中提到的方式
})

// 清空文件,在最后构建的时候才加入这部
task('clean-dist', cb => {
    return del([sourceBuild + '/**/*'], cb);
});
// 清空文件,在最后构建的时候才加入这部
task('clean-tmp', cb => {
    return del([sourceTemp + '/**/*'], cb);
});

// sass 初始化的时候编译, 并生成sourcemap 便于调试
task('sass', function() {
    var autoprefixOpt = {}; //参考 https://github.com/postcss/autoprefixer#options
    var sassOpt = {
        "outputStyle": "compressed"
    }
    return src(config.source.scss)
        // 生成css对应的sourcemap
        .pipe(sourcemaps.init())
        .pipe(sass(sassOpt).on('error', sass.logError))
        .pipe(app.autoprefixer ? autoprefixer(autoprefixOpt) : plumber())
        .pipe(sourcemaps.write('./'))
        .pipe(dest(sourceBuild + "/css"))
        .pipe(dest(sourcePath + "/css"))
});
// less 初始化的时候编译, 并生成sourcemap 便于调试
task('less', function() {
    return src(config.source.less)
        .pipe(sourcemaps.init())
        .pipe(less())
        .pipe(sourcemaps.write('./'))
        .pipe(dest(sourceBuild + "/css"))
        .pipe(dest(sourcePath + "/css"))
});
// less 初始化的时候编译, 并生成sourcemap 便于调试
task('less-build', function(cb) {
    del([sourceBuild + '/css/*.css.map']);
    return src(config.source.less)
        .pipe(less())
        .pipe(dest(sourceBuild + "/css"))
        .pipe(dest(sourcePath + "/css"))
});
// sass 编译成压缩版本
task('sass-build', function(cb) {
    var autoprefixOpt = {}; //参考 https://github.com/postcss/autoprefixer#options
    var sassOpt = {
        "outputStyle": "compressed"
    }
    del([sourceBuild + '/css/*.css.map']);
    return src(config.source.scss)
        .pipe(sass(sassOpt).on('error', sass.logError))
        .pipe(app.autoprefixer ? autoprefixer(autoprefixOpt) : plumber())
        .pipe(dest(sourceBuild + "/css"))
        .pipe(dest(sourcePath + "/css"))
        .pipe(app.cleancss ? minifycss({
            "compatibility": "ie8"
        }) : plumber())
        .pipe(reload({ stream: true }));
});
// css 编译
task('css', function() {
    // 编译style.scss文件
    return src(config.source.css)
        .pipe(changed(sourceBuild + '/css/'))
        .pipe(dest(config.output.css))
})

// 改变的时候才执行压缩
task('css-minify', function() {
    // 编译style.scss文件
    return src(config.source.css)
        .pipe(app.cleancss ? minifycss({
            "compatibility": "ie8"
        }) : plumber())
        .pipe(dest(config.output.css))
})


// move all file except pages/js/** .sass .md
task('move', function() {
    return src(config.watcher.moveRule)
        .pipe(changed(config.watcher.rootRule))
        .pipe(dest(config.output.root));
});

// compress html
task('html', function() {
    var options = {
        "removeComments": true,
        "collapseWhitespace": false,
        "collapseBooleanAttributes": false,
        "removeEmptyAttributes": false,
        "removeScriptTypeAttributes": true,
        "removeStyleLinkTypeAttributes": true,
        "minifyJS": true,
        "minifyCSS": true
    };
    return src(config.watcher.htmlRule)
        .pipe(app.htmlmin ? htmlmin(options) : changed(sourceBuild))
        .pipe(dest(sourceBuild))

});

// compress image
task('images', function() {
    // 有大图会很慢,默认不开启
    return src(config.source.images)
        // .pipe(changed(config.output.images))
        .pipe(app.imagemin ? imagemin([
            imagemin.jpegtran({ progressive: true }),
            imagemin.optipng({ optimizationLevel: 5 }),
            imagemin.svgo({
                plugins: [
                    { removeViewBox: true },
                    { cleanupIDs: false }
                ]
            })
        ]) : changed(config.output.images))
        .pipe(dest(config.output.images));

});


// 监测新增
function addFile(file) {
    console.log(file, "added");
    gulp.src(file, { base: './' + sourcePath }) //指定这个文件
        .pipe(gulp.dest('./' + sourceBuild))
}
// 监测新增

function changeFile(file) {
    console.info(file, "changed");

    let isJs = file.lastIndexOf(".js") > -1 && file.lastIndexOf(".json") < 0;
    let isHtml = file.lastIndexOf(".html") > -1;
    let isScss = file.lastIndexOf(".scss") > -1;
    let isCss = file.lastIndexOf(".css") > -1;
    let isLess = file.lastIndexOf(".less") > -1;

    if (isJs) {
        gulp.src(file, { base: './' + sourcePath }) //指定这个文件
            .pipe(plumber({
                errorHandler: function(error) {
                    console.log(error)
                    this.emit('end');
                }
            }))
            // translate es5
            .pipe(babel(app.babel))
            .pipe(gulp.dest('./' + sourceBuild))
            .pipe(reload({ stream: true }))
            .pipe(md5(10, sourceBuild + '/**/*.html'))
    } else if (isScss) {

        let autoprefixOpt = {}; //参考 https://github.com/postcss/autoprefixer#options
        let sassOpt = {
            "outputStyle": "compressed"
        }
        gulp.src(config.source.scss)
            // 生成css对应的sourcemap
            .pipe(sourcemaps.init())
            .pipe(sass(sassOpt).on('error', sass.logError))
            .pipe(app.autoprefixer ? autoprefixer(autoprefixOpt) : plumber())
            .pipe(sourcemaps.write('./'))
            .pipe(dest(sourceBuild + "/css"))
            .pipe(dest(sourcePath + "/css"))
            .pipe(reload({ stream: true }));

    } else if (isLess) {

        gulp.src(config.source.less)
            .pipe(sourcemaps.init())
            .pipe(less())
            .pipe(sourcemaps.write('./'))
            .pipe(dest(sourceBuild + "/css"))
            .pipe(dest(sourcePath + "/css"))
            .pipe(reload({ stream: true }));

    } else if (isHtml) {

        gulp.src(file, { base: './' + sourcePath })
            .pipe(plumber())
            .pipe(htmlmin(app.htmlmin))
            .pipe(gulp.dest('./' + sourceBuild))
            .pipe(md5(10))
            .pipe(reload({ stream: true }))
    } else if (isCss) {

        gulp.src(file, { base: './' + sourcePath })
            .pipe(gulp.dest('./' + sourceBuild))
            .pipe(md5(10, sourceBuild + "/**/*.html"))
            .pipe(reload({ stream: true }))
    } else {
        gulp.src(file, { base: './' + sourcePath })
            .pipe(gulp.dest('./' + sourceBuild))
            .pipe(reload({ stream: true }))
    }

}

// 起一个普通服务
task('server', function() {
    var portObj = getServerPort();

    let proxys = [];
    if ("proxy" in app) {
        let proxyObj = app["proxy"];
        let keys = Object.keys(proxyObj);

        keys.forEach(function(item, i) {
            let proxyItem = proxy(item, proxyObj[item])
            proxys.push(proxyItem);
        })
    }

    // 起一个同步服务
    browserSync.init({
        ui: {
            port: portObj.devPort + 1
        },
        server: {
            baseDir: sourcePath,
            middleware: proxys
        },
        port: portObj.devPort,
        ghostMode: false,
        codeSync: isDevLivereload
    });

    // 插入二维码,手机扫码调试
    var qrurl = "http://" + ip + ":" + portObj.devPort + app.qrcode;
    qrcode.generate(qrurl, { small: true });

});

// 起一个同步实时修改的服务
task('server-sync', function() {
    var portObj = getServerPort();

    let proxys = [];
    if ("proxy" in app) {
        let proxyObj = app["proxy"];
        let keys = Object.keys(proxyObj);

        keys.forEach(function(item, i) {
            let proxyItem = proxy(item, proxyObj[item])
            proxys.push(proxyItem);
        })
    }

    // 起一个同步服务
    browserSync.init({
        ui: {
            port: portObj.distPort + 1
        },
        server: {
            baseDir: sourceBuild,
            middleware: proxys
        },
        port: portObj.distPort,
        ghostMode: false,
        notify: false,
        codeSync: isDistLivereload,
        // plugins: ['bs-console-qrcode']
    });

    // 插入二维码,手机扫码调试
    var qrurl = "http://" + ip + ":" + portObj.distPort + app.qrcode;

    qrcode.generate(qrurl, { small: true });
    console.log("手机扫码预览效果");

    // 新增删除由插件负责
    watch(config.watcher.rootRule)
        .on('add', addFile)
        .on('change', changeFile)
        .on('unlink', function(file) {
            //删除文件
            let distFile = './' + sourceBuild + '/' + path.relative('./' + sourcePath, file); //计算相对路径
            fse.existsSync(distFile) && fse.unlink(distFile);
            console.warn(file, "deleted")
        });
});

// 清空缓存, 重新编译
exports.build = series('clean-tmp', 'clean-dist', 'move', 'css-minify', 'images', 'html', 'sass-build', 'less-build', 'babel-mini', 'browserify') //series是gulpV4中新方法，按顺序执行

// 先编译再起服务,不需要每次都清除文件夹的内容 如果有scss目录,会在最后才生成, 如果没有,则以src/css/style.css 作为主要样式
exports.dev = series('move', 'html', 'css', 'images', 'sass', 'less', 'babel', 'server-sync')