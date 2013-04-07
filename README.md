Forerun, in a haughty set of words, is a real-time discussion platform. You can think of it as a cross between a forum and a chatroom. There's a traditional forum style list of threads, but there are also real-time features like dynamic updating and a list of online users.

Screenshots
---

![](https://raw.github.com/wcauchois/forerun/master/screenshots/splash_page.png)

![](https://raw.github.com/wcauchois/forerun/master/screenshots/home_page.png)

![](https://raw.github.com/wcauchois/forerun/master/screenshots/thread_reply_section.png)

Stack
---

- Node JS
- Express web framework
- MongoDB (via Mongoose ODM)
- Mustache templates (client & serverside)
- [Flat-UI](http://designmodo.github.io/Flat-UI/)
- Markdown formatting
- Socket.IO
- Amazon SES
- Foreman

Structure
---

At a high level, Forerun is divided into two components: a frontend server and an API server. The frontend server does not interact with the database, instead making API calls to retreive necessary information and perform actions. The frontend server is granted an access level of 6, ensuring that it has access to API calls that we wouldn't want the general public to use. However, most API calls from the frontend are made on behalf of the logged-in user.

All of the source code is contained in the `src` directory. The subfolders and important files are detailed below:

- `src/node` is where all of the serverside code is stored.
- `src/webapp` is where static files are stored. These files will get served as-is by Express.
- `src/logviewer` is a crude webapp that lets you browse the server logs (from both API and frontend).
- `src/resources/bundles.json` defines "bundles" for every page, as well as a "root" bundle. A bundle defines the resources that go into that page: like scripts, stylesheets, and the main template to use when rendering. Properties from "root" will be inherited by each page.
- `src/resources/mustache-templates` is where client and server-side templates are stored. Note that while many server-side templates contain dashes in their name, client-side templates use lowerCamelCase. This is so that client-side templates can be accessed easily as a property of the globel `forerun.templates` object.

Develop
---

To get started, install [Node JS](http://nodejs.org/) and [https://github.com/ddollar/foreman](Foreman). You'll also need to setup a local instance of [MongoDB](http://www.mongodb.org/). You might want to create a file called `config/development.json` to override parameters from `config/default.json`.

Next, run `foreman start`, direct your browser to `http://localhost:3000` (or whatever you set the port to be in your configuration), and get started developing!

I'm happy to accept pull requests.

Deploy
---

I deploy my instance of Forerun to a Linode box, but these instructions should be generally applicable. Foreman lets you export Procfiles to upstart, so you could do that, but I just start the prod server by running `foreman start` through the provided `scripts/ctl.sh` script. An example Git post-receive hook is included in the scripts directory, that would let you `git push` to deploy. Note that you can only push to a bare repository, so you would create a bare repository on your server and then the post-receive hook will clone that into a working directory (which is then used to start the Forerun server).

To provide configuration parameters for production, edit or create `config/production.json`.

These instructions are probably not generally applicable, so you'll want to adapt them to your specific setup.

