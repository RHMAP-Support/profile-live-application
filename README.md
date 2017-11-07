# Profiling A Live Application in RHMAP

Sometimes an app is not performing as well as desired but load testing does not provide enough insight in a test environment. In cases like this it can be useful to profile an application in the live environment. This may be your pre-prod/UAT environment or even production.

NodeJS offers some very simple command flags to profile the application using v8's profiling tools. See the [NodeJS Guide](https://nodejs.org/en/docs/guides/simple-profiling/) for more information on profiling.

## Enabling NodeJS profiling

Since RHMAP 3.x will start your application by running `node application.js` we have to enable profiling by spawning a child process with the --prof flag enabled. We can do this in such a way that the profiling can be enabled by an environment variable.

First we move the current `application.js` to a new `server.js` file.

```shell
mv application.js server.js
```

Then we create a new `application.js` file to be our entrypoint that calls back to our `server.js`.

```shell
touch application.js
```

Now let's add some code to `application.js`

```js
new Promise((resolve, reject) => {
    if(!process.env.DEBUG_PROFILE_TIME) return resolve();
    //this is where we will spawn the child process with profiling enabled
}).then(() => {
    require('./server.js');
});
```

This is a very simple promise. We are using a promise here because the majority of our code will be asynchronous and the flow will be easier to follow then with nested callbacks. We also want the ability to turn the profiling off after `DEBUG_PROFILE_TIME` because the profiling does come with some overhead and we won't want to leave it on for a live application permenantly. So when we are done profiling the application for a period of time we can simply resolve the promise and the server will start normally. If no `DEBUG_PROFILE_TIME` is provided then the promise resolves immediately and the server starts normally.

We will need a few modules to perform the following steps:

1. Spawn a new child process with the --prof flag
1. Kill child process after `DEBUG_PROFILE_TIME`
1. Restart server without profiling
1. Find the resulting `isolate-0xnnnnnnnnnnnn-v8.log` file
1. Process the isolate file

For step 2 we will use the `glob` module so we need to install it. It should be included in one of the dependencies anyways so it won't add much weight to the project but it's best practice to add it to your package.json as well. The other modules that we need are core modules so we won't need to install them.

```bash
npm install glob --save
```

Now let's add the modules to our code just after the `DEBUG_PROFILE_TIME` condition. We don't need them if profiling is not enabled so let's not require them before this.

```js
new Promise((resolve, reject) => {
    if(!process.env.DEBUG_PROFILE_TIME) return resolve();
    //this is where we will spawn the child process with profiling enabled

    const { spawn } = require('child_process');
    const glob      = require('glob');
    const fs        = require('fs');

}).then(() => {
    require('./server.js');
});
```

### Spawning the child process

Spawning a child process is fairly straight forward. We want to pipe the output to process.stdout/stderr so that we don't lose any logging. After `DEBUG_PROFILE_TIME` we kill the child process and restart the server without profiling by resolving the promise. This will be similar to an application restart in the platform but it should be faster since the node environment is already running.

```js
...
const { spawn } = require('child_process');
const glob      = require('glob');
const fs        = require('fs');

const server = spawn('node', ['--prof',  'server.js']);
server.stdout.pipe(process.stdout);
server.stderr.pipe(process.stderr);

server.on('close', (code, signal) => {
    console.log('Restarting server without profiling now');
    resolve();
    //...profile processing code will go here
});

setTimeout(() => server.kill('SIGINT'), process.env.DEBUG_PROFILE_TIME);
...
```

### Finding the profile isolate file

The v8 profiler creates an isolate file in the `isolate-0xnnnnnnnnnnnn-v8.log` format. Since we don't know what `nnnnnnnnnnnn` will be we we'll just find the latest `isolate-*` file. We do this by using the glob module to find all the files and then we just sort by the modified time.

```js
function findLatestProfile(){
    console.log('Finding latest profile...');
    return new Promise((resolve, reject)=> {
        glob('isolate-*', (err, paths) => err ? reject(err) : resolve(paths));
    }).then((paths) => {
        return Promise.all(paths.map((path) =>{
            return new Promise((resolve, reject) => {
                fs.stat(path, (err, stat) => err ? reject(err) : resolve({ path, stat }));
            });
        }));
    }).then((paths) => {
        return paths.sort((a, b) => b.stat.mtime - a.stat.mtime)[0].path;
    });
}
```

### Processing the profile isolate file

Once we find the correct isolate file we can process it by spawning another process. We want to capture the output from this child process into a variable so we can output it as a whole to the application logs. Remember the server has already been restarted at this point so it may be outputing to the log and we don't want the lines to get mixed up. Also if there is an error anwywhere in the finding and processing of the isolate file we just want to catch it and log it. Promises make this pretty simple.

```js
server.on('close', (code, signal) => {
    console.log('Restarting server without profiling now');
    resolve();

    findLatestProfile().then((path) => {
        return new Promise((resolve, reject) => {
            console.log('Processing profile...', path);

            const profile = spawn('node', ['--prof-process', path]);
            let output = '';
            profile.stdout.on('data', (chunk) => output += chunk);
            profile.on('err', reject);
            profile.on('close', () => resolve(output));
        });

    }).then((profile) => {
        console.log('===Profile Output Start============');
        console.log(profile);
        console.log('===Profile Output End============')
    }).catch((err) => {
        console.warn('Error processing profile', err);
    });
});
```

### Complete example

This is what the complete `application.js` should look like.

```js
new Promise((resolve, reject) => {
    if(!process.env.DEBUG_PROFILE_TIME) return resolve();

    console.log(`Profiling application for ${process.env.DEBUG_PROFILE_TIME} ms...`);

    const { spawn } = require('child_process');
    const glob      = require('glob');
    const fs        = require('fs');

    function findLatestProfile(){
        console.log('Finding latest profile...');
        return new Promise((resolve, reject)=> {
            glob('isolate-*', (err, paths) => err ? reject(err) : resolve(paths));
        }).then((paths) => {
            return Promise.all(paths.map((path) =>{
                return new Promise((resolve, reject) => {
                    fs.stat(path, (err, stat) => err ? reject(err) : resolve({ path, stat }));
                });
            }));
        }).then((paths) => {
            return paths.sort((a, b) => b.stat.mtime - a.stat.mtime)[0].path;
        });
    }

    const server = spawn('node', ['--prof',  'server.js']);
    server.stdout.pipe(process.stdout);
    server.stderr.pipe(process.stderr);

    server.on('close', (code, signal) => {
        console.log('Restarting server without profiling now');
        resolve();

        findLatestProfile().then((path) => {
            return new Promise((resolve, reject) => {
                console.log('Processing profile...', path);

                const profile = spawn('node', ['--prof-process', path]);
                let output = '';
                profile.stdout.on('data', (chunk) => output += chunk);
                profile.on('err', reject);
                profile.on('close', () => resolve(output));
            });

        }).then((profile) => {
            console.log('===Profile Output Start============');
            console.log(profile);
            console.log('===Profile Output End============')
        }).catch((err) => {
            console.warn('Error processing profile', err);
        });
    });

    setTimeout(() => server.kill('SIGINT'), process.env.DEBUG_PROFILE_TIME);
}).then(() => {
    require('./server.js');
});
```

### .gitignore

At this point we will want to add `isolate-*` to our .gitignore file so we don't check in any of the profiles.