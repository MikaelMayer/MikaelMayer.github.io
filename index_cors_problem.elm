

<html>
  <head>
    <meta name="website" url="https://mikaelmayer.github.io/wysiwyg/">
    <meta name="source" url="src/index.elm">
    <meta name="output" url="index.html">
    <meta name="pushurl" url="https://github.com/MikaelMayer/MikaelMayer.github.io.git/wysiwyg/">
    <script src="https://unpkg.com/browserfs"></script>
    <script src="https://unpkg.com/isomorphic-git"></script>
    <script>
    BrowserFS.configure({ fs: "IndexedDB", options: {} }, function (err) {
      if (err) return console.log(err);
      window.fs = BrowserFS.BFSRequire("fs");
      git.plugins.set('fs', window.fs);
    });
    </script>
  </head>
  <body>
    Hello world
  </body>
</html>