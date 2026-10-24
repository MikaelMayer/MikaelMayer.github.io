user  = vars |> case of {user} -> user; _ -> "anonymous"

thisfile = nodejs.fileread "src/test.elm"
        |> Maybe.getUnless (== "")
        
<html><head></head><body contenteditable="true">
<span>Hello @user!</span>
You can modify this file here:<br>
<div style="white-space:pre;font-family:monospace;outline:1px solid black;padding:5px">@thisfile</div>
@clientscript
</body></html>