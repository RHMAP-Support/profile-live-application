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

For step 4 we will use the `glob` module so we need to install it. It should be included in one of the dependencies anyways so it won't add much weight to the project but it's best practice to add it to your package.json as well. The other modules that we need are core modules so we won't need to install them.

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

### Testing it out

I've based this repo off the hello world template so I will need to just add some sort of heavy process to the hello endpoint. The profile does not show callers that take less than 2% so it would be mostly compile time calls and not my project code.

```js
hello.get('/', function(req, res) {
  console.log(new Date(), 'In hello route GET / req.query=', req.query);
  var world = req.query && req.query.hello ? req.query.hello : 'World';

  const secret = 'abcdefg';
  let hash = '';
  for(let i = 0; i < 1000; i++){
    hash += crypto.createHmac('sha256', secret).update('I love cupcakes').digest('hex');
  }

  // see http://expressjs.com/4x/api.html#res.json
  res.json({msg: 'Hello ' + world, hash});
});
```

To start the application we just need to set the environment variable first. I'm going to use cross-env here to just to simplify it across operating systems.

```shell
cross-env DEBUG_PROFILE_TIME=30000 npm start
```

This will profile the application for 30 seconds. Now in another terminal we can use curl to send reqeusts

```shell
for i in {1..100}; do curl http://localhost:8001/hello; done
```

Or in Windows PowerShell

```powershell
1..100 | % { curl http://localhost:8001/hello }
```

You should see output in the logs similar to the following (truncated):

```shell
> helloworld-cloud@0.2.0 start C:\Users\Support\Documents\Git Repos\SP---Profiling-Example-Cloud-App
> node application.js

Profiling application for 30000 ms...
no way to determine mongo connection string
Warning! Could not get a mongodb connection string. Sync will not work. If running in a Dynofarm/FeedHenry MBaaS, ensure the database is upgraded
App started at: Tue Nov 07 2017 12:17:33 GMT-0500 (Eastern Standard Time) on port: 8001
2017-11-07T17:17:40.570Z 'In hello route GET / req.query=' {}
2017-11-07T17:17:40.672Z 'In hello route GET / req.query=' {}
[...truncated...]
Restarting server without profiling now
Finding latest profile...
no way to determine mongo connection string
Warning! Could not get a mongodb connection string. Sync will not work. If running in a Dynofarm/FeedHenry MBaaS, ensure the database is upgraded
App started at: Tue Nov 07 2017 12:18:03 GMT-0500 (Eastern Standard Time) on port: 8001
Processing profile... isolate-00000258E2F43F30-v8.log
===Profile Output Start============
Statistical profiling result from isolate-00000258E2F43F30-v8.log, (14973 ticks, 16 unaccounted, 0 excluded).

 [Shared libraries]:
   ticks  total  nonlib   name
  14243   95.1%          C:\WINDOWS\SYSTEM32\ntdll.dll
    613    4.1%          C:\Users\Support\AppData\Local\nvs\node\6.11.3\x64\node.exe
     11    0.1%          C:\WINDOWS\System32\KERNEL32.DLL
      2    0.0%          C:\WINDOWS\System32\KERNELBASE.dll
      1    0.0%          C:\WINDOWS\System32\WS2_32.dll

 [JavaScript]:
   ticks  total  nonlib   name
      5    0.0%    4.9%  LazyCompile: *normalizeStringWin32 path.js:12:30
      5    0.0%    4.9%  LazyCompile: *Hmac crypto.js:88:14
      5    0.0%    4.9%  Builtin: ArgumentsAdaptorTrampoline
      4    0.0%    3.9%  Builtin: CallFunction_ReceiverIsAny
      3    0.0%    2.9%  Stub: StringAddStub_CheckNone_NotTenured
      3    0.0%    2.9%  Builtin: CallFunction_ReceiverIsNotNullOrUndefined
[...truncated...]

 [C++]:
   ticks  total  nonlib   name

 [Summary]:
   ticks  total  nonlib   name
     87    0.6%   84.5%  JavaScript
      0    0.0%    0.0%  C++
     28    0.2%   27.2%  GC
  14870   99.3%          Shared libraries
     16    0.1%          Unaccounted

 [C++ entry points]:
   ticks    cpp   total   name

 [Bottom up (heavy) profile]:
  Note: percentage shows a share of a particular caller in the total
  amount of its parent calls.
  Callers occupying less than 2.0% are not shown.

   ticks parent  name
  14243   95.1%  C:\WINDOWS\SYSTEM32\ntdll.dll

    613    4.1%  C:\Users\Support\AppData\Local\nvs\node\6.11.3\x64\node.exe
    521   85.0%    C:\Users\Support\AppData\Local\nvs\node\6.11.3\x64\node.exe
    138   26.5%      LazyCompile: *runInThisContext vm.js:96:26
    138  100.0%        LazyCompile: ~Module._compile module.js:510:37
     92   66.7%          LazyCompile: *Module._extensions..js module.js:577:37
     92  100.0%            LazyCompile: *Module.load module.js:478:33
     46   33.3%          LazyCompile: ~Module._extensions..js module.js:577:37
     36   78.3%            LazyCompile: ~Module.load module.js:478:33
     10   21.7%            LazyCompile: *Module.load module.js:478:33
[...truncated...]

===Profile Output End============
```

### Deploying it in RHMAP

Now that we know it works and we haven't broken our existing app we can deploy this to RHMAP. 

1. Commit and push your changes to the studio.
1. Add the `DEBUG_PROFILE_TIME` environment variable to your application in the RHMAP Studio.( Choose a time that is practical for your application. 5 minutes or 300000 ms is probably a good starting point.)
1. Push the environment variables
1. Let the application run and perform any load testing that you might want to perform on the application
1. After the time specified, download the logs from the log archive in the studio.

If at any point we want to reprofile the application we can simply restart the application. If you want to remove profiling you can delete the environment variable and push environment variables again.

See the example.log file in this repo to see an example of the profile from the studio logs. You can see that the anonymous function for my hello route is in the top 3 for CPU time. You can trace this down to the crypto call to being the biggest contributor.
