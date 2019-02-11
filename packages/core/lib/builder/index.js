const path = require("path");
const debug = require('debug')('core')
const fs = require("fs")
const buildManifest = require('./buildManifest');
const installPackages = require("./installPackages")
const sync = require("./cloneAndWatch")
const ora = require('ora');
const slash = require("../utils/fixPathSlashes")
const spinner = ora({
  color: 'green',
  spinner: "star",
  text: "Starting..."
})

var watchDeferTimeoutID = false
module.exports = async function build(sourcePath, buildPath, onManifest) {
  var currentManifest = false

  debug("buildPath", buildPath)

  sync({
    sources: [path.join(sourcePath, '/**/*')],
    target: buildPath,
    watch: true,
    clean: true
  }, async (event, file) => {
    debug("CHANGE", event, file)

    // recreate manifest
    // wait until files have 'settled'. 
    if (watchDeferTimeoutID) clearTimeout(watchDeferTimeoutID)
    watchDeferTimeoutID = setTimeout(async () => {
      var filesArr = file ? [file] : false
      var filesUpdated = file ? [] : false
      filesArr && filesArr.forEach((f) => {
        if (currentManifest.fileToLambdas[f]) {
          filesUpdated = filesUpdated.concat(currentManifest.fileToLambdas[f])
        }
      })

      debug("filesUpdated", filesUpdated)
      const { manifest, forbiddenFiles } = await updateManifest(buildPath, currentManifest, filesUpdated)
      currentManifest = manifest
      var serverAddress = process.env.SERVERADDRESS || ("http://localhost:" + process.env.PORT)

      // check if directory is empty on first run
      if (event === "ready") {
        fs.readdir(sourcePath, function (err, files) {
          if (err) {
            // some sort of error
          } else {
            if (!files.length) {
              // directory appears to be empty
              spinner.stopAndPersist({ symbol: "⚠️ ", text: "It looks like the given directory is empty. Add a file (like index.js) and see what happens!" })
            }
            else {
              spinner.succeed("Server running on " + serverAddress)
            }
          }
        });
      }
      else {
        spinner.succeed("Server running on " + serverAddress)
      }


      onManifest(manifest, forbiddenFiles, filesUpdated)
    }, 1000);

  })
}


async function updateManifest(buildPath, currentManifest, updatedFiles){
  spinner.start("Updating packages")
  await installPackages(buildPath, updatedFiles)
  spinner.start("Generating manifest")
  const manifest = await buildManifest(buildPath, currentManifest, updatedFiles)
  
  var forbiddenFiles = []
  manifest.lambdas.forEach((endpoint)=>{
    forbiddenFiles.push(endpoint[1])
    // TODO: see if dependancy tree files are also to be added here or not.
  })
  debug("manifest", manifest)
  return {manifest, forbiddenFiles}
}