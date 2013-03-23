.PHONY: docs

docs: src/resources/docs.json

src/resources/docs.json: scripts/apidocs.py src/node/apiserver/server.js
	python scripts/apidocs.py src/node/apiserver/server.js >src/resources/docs.json

