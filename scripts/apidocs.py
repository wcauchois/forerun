import os, sys
import xml.etree.ElementTree as ET
import json

def extract_doc_tree(name):
  doc_lines = []
  with open(name, 'r') as f:
    for line in f.readlines():
      if line.startswith('/// '):
        doc_lines.append(line[4:].strip('\n'))
  return ET.fromstring('<root>%s</root>' % ''.join(doc_lines))

def str_bool(s):
  return True if s == 'true' else False

if __name__ == '__main__':
  if len(sys.argv) < 2:
    sys.exit(1)

  tree = extract_doc_tree(sys.argv[1])
  rendered_endpoints = []
  for endpoint in tree.findall('endpoint'):
    rendered_params = []
    for param in endpoint.findall('param'):
      rendered_params.append({
        'name': param.attrib['name'],
        'desc': param.text
      })
    response = endpoint.find('response')
    rendered_response = None
    if response is not None:
      rendered_response = json.dumps(json.loads(response.text), indent=2)
    rendered_endpoints.append({
      'path': endpoint.attrib['path'],
      'method': endpoint.attrib['method'],
      'requires_token': str_bool(endpoint.attrib['requires_token']),
      'summary': endpoint.find('summary').text,
      'params': rendered_params,
      'response': rendered_response
    })

  docs = {
    'endpoints': rendered_endpoints
  }

  print json.dumps(docs, indent=2)

