function main() {
  var CFG = {
    GRID: 20,
    MARGIN_L: 30,
    MARGIN_R: 50,
    MARGIN_T: 30,
    MARGIN_B: 30,

    // Y_SCALE: 'birth',
    Y_SCALE: 'free',

    FORCE_CHARGE: -150,
    FORCE_DISTANCE: 100,
    FORCE_GRAVITY: 0.03
  }

  var nodeMap = {}
  var nodes = []
  var links = []
  var graph
  var nodeEls
  var linkEls

  var dateFormat = d3.time.format('%Y-%m-%d')
  var dateFormatYear = d3.time.format('%Y')

  var activeNode = null
  var width = 1, height = 1

  var timeScale = d3.scale.linear()
  var genderColorScale = d3.scale.ordinal()
    .domain(['M', 'F'])
    .range(['#1f77b4', '#d62728'])
  var relColorScale = d3.scale.ordinal()
    .domain(['child', 'spourse'])
    .range(['#666666', '#d62728'])

  var force = d3.layout.force()
    .charge(function (d) {
      return d.fixed ? CFG.FORCE_CHARGE * 2 : CFG.FORCE_CHARGE
    })
    .distance(CFG.FORCE_DISTANCE)
    .gravity(CFG.FORCE_GRAVITY)
    .on('tick', onForceTick)
  var drag = force.drag()
    .on('dragstart', dragstart)
    .on('drag', drag)
    .on('dragend', dragend)

  window.addEventListener('keydown', onKeydown)
  document.querySelector('form').addEventListener('submit', onSearch)
  document.querySelector('#toggle').addEventListener('click', onToggle)

  queue()
    .defer(d3.csv, 'nodes.csv')
    .defer(d3.csv, 'links.csv')
    .await(onDataLoad)

  window.addEventListener('resize', onResize)
  onResize()

  function onDataLoad(err, nodesRaw, linksRaw) {
    var parsed = cywc.parseRawNodesAndLinks(nodesRaw, linksRaw);
    nodeMap = parsed.nodeMap;
    nodes = parsed.nodes;
    nodes.forEach(function (d) {
      d.selected = false
      d.expandable = false
    })
    links = parsed.links;
    links.forEach(function (d) {
      d.source.expandable = true
      d.target.expandable = true
    })
    graph = parsed.graph;

    // Clear pre-rendered table rows
    document.querySelector('tbody').innerHTML = ''

    // Apply querystring
    var qs = location.href.split('?')[1] || ''
    var query = {}
    qs.split('&').forEach(function (d) {
      var tokens = d.split('=')
      var name = decodeURIComponent(tokens[0])
      var value = decodeURIComponent(tokens[1])
      query[name] = value
    })

    if (query['q']) {
      document.querySelector('#q').value = query['q']
      onQuery(query['q'])
    }

    onDataChange()

    window.graph = graph
    window.nodes = nodes
    window.links = links
    window.dumpState = dumpState
    window.loadState = loadState
  }

  function onDataChange() {
    var selectedNodes = nodes.filter(function (d) {
      return d.selected
    })
    var selectedLinks = links.filter(function (d) {
      return d.source.selected && d.target.selected
    })

    timeScale.domain([
      d3.min(selectedNodes, function (d) {
        return d.birthRange[0]
      }),
      d3.max(selectedNodes, function (d) {
        return d.birthRange[1]
      })
    ])

    nodeEls = d3.select('svg g.nodes').selectAll('.node').data(selectedNodes, function (d) {
      return d.name
    })
    var nodeGroup = nodeEls.enter()
      .append('g')
      .attr('class', 'node', true)
      .attr('id', function (d) { return 'node_' + d.name })
      .on('click', click)
      .call(drag)
    nodeGroup
      .append('circle')
      .attr('fill', function (d) {
        return genderColorScale(d.gender)
      })
      .attr('r', 0)
    var mainText = nodeGroup
      .append('text')
      .attr('class', 'main')
      .attr('dx', 10)
      .attr('dy', '11px')
    mainText
      .append('tspan')
      .attr('class', 'name')
      .text(function (d) { return d.name })
    mainText
      .append('tspan')
      .attr('class', 'birth')
      .attr('font-size', '9px')
      .text(function (d) {
        if (d.birthPrecision === 'date') {
          return dateFormat(d.birth).substring(0, 4)
        } else if (d.birthPrecision === 'year') {
          return dateFormatYear(d.birth)
        } else {
          return '?'
        }
      })
    nodeGroup
      .append('text')
      .attr('class', 'tags')
      .attr('dx', 10)
      .attr('dy', '-2px')
      .attr('font-size', '9px')
      .selectAll('.tag').data(function (node) {
      return node.tags.split(';')
    }).enter().append('tspan')
      .attr('dx', function (d, i) { return i === 0 ? 10 : 4 })
      .text(String)
    nodeGroup
      .append('text')
      .attr('class', 'briefs')
      .attr('dx', 10)
      .attr('dy', '22px')
      .attr('font-size', '9px')
      .text(function (d) { return d.briefs[0] || '' })

    nodeEls
      .classed('active', function (d) { return d === activeNode })
      .classed('fixed', function (d) { return d.fixed })
      .select('circle')
      .transition()
      .attr('r', function (d) { return d.expandable ? 6 : 4 })
      .attr('filter', function (d) { return d === activeNode ? 'url(#dropShadow)' : '' });

    nodeEls.exit()
      .attr('opacity', 1)
      .transition()
      .attr('opacity', 0)
      .remove()

    linkEls = d3.select('svg g.links').selectAll('.link').data(selectedLinks, function (d) {
      return d.source.name + '+' + d.target.name
    })
    linkEls.enter()
      .append('line')
      .classed('link', true)
      .classed('cur', function (d) { return d.cur })
      .attr('marker-end', function (d) { return d.rel === 'child' ? 'url(#arrowMarker)' : '' })
      .attr('stroke', function (d) { return relColorScale(d.rel) })
    linkEls.exit()
      .remove()

    force
      .nodes(selectedNodes)
      .links(selectedLinks)
      .start()

    var table = d3.select('tbody').selectAll('tr').data(nodes, function (d) {
      return d.name
    })
    table.enter()
      .append('tr')
      .attr('id', function (d) { return 'row_' + d.name })
      .html(function (d) {
		var link = '';
		if(d.tpp_person_id) {
			link  = '<a href="http://pokr.kr/person/' + d.tpp_person_id + '" target="_blank">More</a>';
		} else if(d.wiki) {
			link = '<a href="' + d.wiki + '" target="_blank">More</a>';
		}

		return '<td class="name">' + d.name + '</td><td class="briefs">' + d.briefs.join(', ') + '</td><td class="link">' + link + '</td>'
      })
      .on('click', clickTable)

    table
      .classed('selected', function (d) { return d.selected })

    table.exit()
      .remove()
  }

  function onToggle() {
    var logsEl = document.querySelector('.logs')
    if (logsEl.getAttribute('class') === 'logs') {
      logsEl.setAttribute('class', 'logs hide')
    } else {
      logsEl.setAttribute('class', 'logs')
    }
  }

  function onForceTick() {
    if (!nodeEls) return

	var MARGIN_R = CFG.MARGIN_R
    nodeEls.attr('transform', function (d) {
      if (!d.fixed) {
        if (CFG.Y_SCALE === 'birth') {
          // Move y into the boundary of birth range
          if (d.birth !== null) {
			var birthY0 = timeScale(d.birthRange[0])
		    var birthY1 = timeScale(d.birthRange[1])
		    if(d.y < birthY0 || d.y > birthY1) {
              var targetY = Math.max(birthY0, Math.min(d.y, birthY1))
              d.y = d.y - (d.y - targetY) * 0.8
		    }
          }
        }

        d.x = Math.max(0, Math.min(width - MARGIN_R, d.x))
        d.y = Math.max(0, Math.min(height, d.y))
      }

      return 'translate(' + d.x + ',' + d.y + ')'
    })
    linkEls
      .attr('x1', function (d) {
        return d.source.x
      })
      .attr('y1', function (d) {
        return d.source.y
      })
      .attr('x2', function (d) {
        return d.target.x
      })
      .attr('y2', function (d) {
        return d.target.y
      })
  }

  function toggleNode(node) {
    var selected = !node.selected

    if (selected) {
      node.selected = true
      expandNode(node)
    } else {
      node.selected = false
      node.fixed = false
      collapseNode(node)
    }
  }

  function toggleExpand(node) {
    if (node.expandable) {
      expandNode(node)
    } else {
      collapseNode(node)
    }
  }

  function expandNode(node) {
    node.adjs.forEach(function (d) {
      d.node.selected = true
	  if(d.node.x === undefined) {
	    d.node.x = node.x;
		d.node.y = node.y;
	  }
    })

    // Update expandable flag
    nodes.filter(function (d) {
      return d.selected
    }).forEach(function (d) {
      d.expandable = d.adjs.filter(function (d) {
          return !d.node.selected
        }).length > 0
    })
  }

  function collapseNode(node) {
    node.adjs.filter(function (d) {
      return !d.node.fixed
    }).forEach(function (d) {
      d.node.selected = false
    })

    // Update expandable flag
    nodes.filter(function (d) {
      return d.selected
    }).forEach(function (d) {
      d.expandable = d.adjs.filter(function (d) {
          return !d.node.selected
        }).length > 0
    })
  }

  function clickTable() {
    var name = this.querySelector('.name').innerHTML.trim()
    var node = nodeMap[name]
    toggleNode(node)
    activeNode = node

    onDataChange()
  }

  function dragstart(d) {
    drag._dragged = false
  }

  function drag(d) {
    if (drag._dragged) return

    drag._dragged = true
    d3.select('svg g.grids').classed('visible', true)

    force.start()
  }

  function dragend(d) {
    if (drag._dragged) {
      d.x = d.px = Math.round(d.x / CFG.GRID) * CFG.GRID
      d.y = d.py = Math.round(d.y / CFG.GRID) * CFG.GRID
      d.fixed = true
      activeNode = d
      onDataChange()
    }

    d3.select('svg g.grids').classed('visible', false)
  }

  function click(d) {
    if (drag._dragged) return

    activeNode = d === activeNode ? null : d
    onDataChange()
  }

  function onKeydown(e) {
    if (document.querySelector('#q:focus')) return

    if (e.keyCode === 84) {
      // T
      if (CFG.Y_SCALE === 'birth') {
        CFG.Y_SCALE = 'free'
        force.gravity(CFG.FORCE_GRAVITY)
      } else {
        CFG.Y_SCALE = 'birth'
        force.gravity(CFG.FORCE_GRAVITY * 0.6)
      }
      onDataChange()
      return
    } else if (e.keyCode === 191) {
      // Slash
      e.preventDefault()
      var q = document.querySelector('#q')
      q.focus()
      q.select()
      return
    }

    if (activeNode) {
      if (e.keyCode === 13) {
        // Enter
        toggleExpand(activeNode)
        onDataChange()
      } else if (e.keyCode === 70) {
        // F
        activeNode.fixed = false
        onDataChange()
      } else if (e.keyCode === 88) {
        // X
        toggleNode(activeNode)
        activeNode = null
        onDataChange()
      } else {
        console.log('Ignoring unknown keyCode: ' + e.keyCode);
      }
    }
  }

  function onSearch(e) {
    e.preventDefault()

    var q = document.querySelector('#q').value.trim()
    if (!q.length) return

    var success = onQuery(q)
    if (success) {
      onDataChange()
      var url = '?q=' + encodeURIComponent(q)
      ga('send', 'pageview', url)
      history.pushState({}, {}, url)
    }
  }

  function onQuery(q) {
    var names = q.split(',')
    var nodes = names.map(function (d) {
      return nodeMap[d]
    })
    nodes.reverse()

    // Check if names are exist
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i]) {
        alert('Unknown name: ' + names[i])
        return false
      }
    }

    // Handle single node query
    if (nodes.length === 1) {
      if (nodes[0].selected) {
        activeNode = nodes[0]
      } else {
        toggleNode(nodes[0])
      }
      return true
    }

    // Handle path query
    for (var i = 1; i < nodes.length; i++) {
      var source = nodes[i - 1]
      var target = nodes[i]
      var path = cywc.shortestPath(graph, source, target);
      if(path) {
        path.forEach(function (name) {
          nodeMap[name].selected = true
        })
        appendLog(cywc.composeSentence(path, nodeMap))
      } else {
        alert('No path between ' + source.name + ' and ' + target.name)
        return false
      }
    }
    onDataChange()
    return true
  }

  function appendLog(message) {
    var logsEl = document.querySelector('.logs')
    var log = document.createElement('li')
    log.innerHTML = message
    logsEl.appendChild(log)
    log.scrollIntoView()
  }

  function onResize() {
    var contentEl = document.querySelector('.content')
    width = contentEl.offsetWidth - CFG.MARGIN_L - CFG.MARGIN_R
    height = contentEl.offsetHeight - CFG.MARGIN_T - CFG.MARGIN_B

    timeScale.range([0, height])

    // Resize SVG
    d3.select('svg')
      .attr('width', contentEl.offsetWidth)
      .attr('height', contentEl.offsetHeight)

    d3.select('svg').selectAll('.grids, .links, .nodes')
      .style('transform', 'translate(' + CFG.MARGIN_L + 'px, ' + CFG.MARGIN_T + 'px)')

    // Update grids
    var nGridVer = Math.ceil(width / CFG.GRID)
    var nGridHor = Math.ceil(height / CFG.GRID)
    var vers = d3.select('svg .grids').selectAll('line.ver').data(d3.range(nGridVer))
    vers.enter()
      .append('line')
      .attr('class', 'ver')
    vers
      .attr('x1', function (d) {
        return d * CFG.GRID
      })
      .attr('x2', function (d) {
        return d * CFG.GRID
      })
      .attr('y1', 0)
      .attr('y2', height)
      .classed('major', function (d) {
        return d % 5 === 0
      })
    vers.exit()
      .remove()

    var hors = d3.select('svg .grids').selectAll('line.hor').data(d3.range(nGridHor))
    hors.enter()
      .append('line')
      .attr('class', 'hor')
    hors
      .attr('y1', function (d) {
        return d * CFG.GRID
      })
      .attr('y2', function (d) {
        return d * CFG.GRID
      })
      .attr('x1', 0)
      .attr('x2', width)
      .classed('major', function (d) {
        return d % 5 === 0
      })
    hors.exit()
      .remove()

    // Restart force layout
    force.size([width, height])
    force.start()
  }

  function dumpState() {
    var selectedNodes = nodes
      .filter(function(node) {return node.selected})
      .map(function(node) {
        return {
	  name: node.name,
          x: node.x|0,
          y: node.y|0
	}
      });
    var minX = Infinity
    var minY = Infinity
    selectedNodes.forEach(function(node) {
      if(node.x < minX) minX = node.x
      if(node.y < minY) minY = node.y
    })
    selectedNodes.forEach(function(node) {
      node.x -= minX
      node.y -= minY
    })

    var selectedLinks = links.filter(function (d) {
      return d.source.selected && d.target.selected
    }).map(function(link) {
      return {
        cur: link.cur,
        rel: link.rel,
        source: link.source.name,
        target: link.target.name
      };
    });

    return {nodes: selectedNodes, links: selectedLinks};
  }

  function loadState() {
    // Not implemented yet
  }
}

