---
title: Hướng dẫn sử dụng Microservice, Eureka và Zuul Gateway - Phần 2
date: 2023-08-11T09:25:25+07:00
tags: ["Microservice", "Eureka", "Zuul Gateway", "Spring Boot Security", "Spring Cloud Configuration", "Spring Cloud Netflix"]
series: ["Microservice1"]
featured: true
---
Ở bài trước chúng ta đã dựng được một hệ thống microservice đơn giản với User service, Eureka server và Zuul gateway.
Trong bài viết này chúng ta sẽ cùng tìm hiểu về **JWT** và cách để **xác thực và bảo mật** trong hệ thống **Microservice** bằng JWT.

<!--more-->
Chúng ta sẽ tạo 1 service mới là ```auth service``` có nhiệm vụ xác minh danh tính và tạo jwt token khi user login
Còn việc xác thực token sẽ do Zuul gateway đảm nhận, khi có 1 request gửi đến thì Zuul gateway sẽ dựa vào token được cung cấp và xác thực quyền truy cập, xác thực thành công thì mới tiến hành điều hướng request tới các service bussiness khác.

# 1. JWT (Json Based Token)
**Token** là 1 chuỗi string được mã hoá được tạo ra từ hệ thống của chúng ta sau khi xác thực thành công. Và được đính kèm trong các request để cung cấp quyền truy cập vào ứng dụng.

**JWT** là 1 chuẩn JSON để tạo token, được bao gồm bởi 3 phần
* Header: chứa thuật toán hash 
```{type: “JWT”, hash: “HS256”}```
* Payload: chứa các thuộc tính user name, email,... và các giá trị của nó
```{username: "Omar", email: "omar@example.com", admin: true }```
* Signature: là giá trị hash của ```Header + “.” + Payload + Secret key```

# 2. Zuul gateway
Ở trong gateway sẽ thực hiện 2 chức năng: một xác thực token và 2 là chặn tất cả request nếu xác thực không thành công.
Trong file ```pom.xml``` chúng ta cần thêm spring security và JWT
```
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt</artifactId>
</dependency>
```

Để sử dụng security thì chúng ta cần tạo 1 class extend từ ```WebSecurityConfigurerAdapter``` và dùng anotation ```@EnableWebSecurity```
```
package com.example.zuulserver.security;

import com.example.commonservice.security.JwtConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityConfigurerAdapter;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import javax.servlet.http.HttpServletResponse;
import javax.ws.rs.HttpMethod;

@EnableWebSecurity
public class SecurityConfig extends WebSecurityConfigurerAdapter {
    
    @Autowired
    private JwtConfig jwtConfig;
    
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http
                .csrf().disable()
                // make sure we use stateless session; session won't be used to store user's state.
                .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                .and()
                // handle an authorized attempts
                .exceptionHandling().authenticationEntryPoint((req, rsp, e) -> rsp.sendError(HttpServletResponse.SC_UNAUTHORIZED))
                .and()
                // Add a filter to validate the tokens with every request
                .addFilterAfter(new JwtTokenAuthenticationFilter(jwtConfig), UsernamePasswordAuthenticationFilter.class)
                // authorization requests config
                .authorizeRequests()
                // allow all who are accessing "auth" service
                .antMatchers(HttpMethod.POST, jwtConfig.getUri()).permitAll()
                // Any other request must be authenticated
                .anyRequest().authenticated();
    }
    
    @Bean
    public JwtConfig jwtConfig() {
        return new JwtConfig();
    }
}

```
>Class JwtConfig sẽ được tạo sau ở trong phần common service


Tiếp theo chúng ta sẽ viết class filter để xác thực token được đặt tên là ```JwtTokenAuthenticationFilter```, class này sẽ extend từ ```OncePerRequestFilter``` filter này sẽ được kích hoạt mỗi khi request được gửi tới.
```
package com.example.zuulserver.security;

import com.example.commonservice.security.JwtConfig;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.stream.Collectors;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;

public class JwtTokenAuthenticationFilter extends OncePerRequestFilter {
    
    private final JwtConfig jwtConfig;
    
    public JwtTokenAuthenticationFilter(JwtConfig jwtConfig) {
        this.jwtConfig = jwtConfig;
    }
    
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        // 1. get the authentication header. Tokens are supposed to be passed in the authentication header
        String header = request.getHeader(jwtConfig.getHeader());
        
        // 2. validate the header and check the prefix
        if (header == null || !header.startsWith(jwtConfig.getPrefix())) {
            filterChain.doFilter(request, response); // if not valid go to the next filter
            return;
        }
        // If there is no token provided and hence the user won't be authenticated.
        // It's Ok. Maybe the user accessing a public path or asking for a token.
        // All secured paths that needs a token are already defined and secured in config class.
        // And If user tried to access without access token, then he won't be authenticated and an exception will be thrown.
        // 3. Get the token
        String token = header.replace(jwtConfig.getPrefix(), "");
        try {  // exceptions might be thrown in creating the claims if for example the token is expired
            // 4. Validate the token
            Claims claims = Jwts.parser().setSigningKey(jwtConfig.getSecret().getBytes()).parseClaimsJws(token).getBody();
            
            String userName = claims.getSubject();
            if (userName != null) {
                List<String> authorities = (List<String>) claims.get("authorities");
                
                // 5. Create auth object
                // UsernamePasswordAuthenticationToken: A built-in object, used by spring to represent the current authenticated / being authenticated user. // It needs a list of authorities, which has type of GrantedAuthority interface, where SimpleGrantedAuthority is an implementation of that interface
                UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(userName, null, authorities.stream().map(SimpleGrantedAuthority::new).collect(Collectors.toList()));
                // 6. Authenticate the user
                // Now, user is authenticated
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        } catch (Exception e) {
            // In case of failure. Make sure it's clear; so guarantee user won't be authenticated
            e.printStackTrace();
            SecurityContextHolder.clearContext();
        }
        // go to the next filter in the filter chain
        filterChain.doFilter(request, response);
    }
}
```
Và đừng quên thêm security config để sử dụng cho class JwtConfig nhé:
```
...
security:
  jwt:
    uri: /auth/**
    header: Authorization
    prefix: Bearer
    expiration: 86400
    secret: JwtSecretKey
```
# 4. Common service
Service này sẽ chứa những config được sử dụng chung cho nhiều service khác
Chúng ta sẽ tạo class JwtConfig để chứa các config JWT và class này sẽ được sử dụng trong Auth service và Zuul gateway

Cũng tương tự như việc tạo các service khác hãy tạo mới project Spring boot và config file ```pom.xml``` như sau:
```
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-test</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>
```

Tạo class JwtConfig như sau:
```
package com.example.commonservice.security;

import org.springframework.beans.factory.annotation.Value;

public class JwtConfig {
    
    @Value("${security.jwt.uri}")
    private String uri;
    
    @Value("${security.jwt.header}")
    private String header;
    
    @Value("${security.jwt.prefix}")
    private String prefix;
    
    @Value("${security.jwt.expiration}")
    private int expiration;
    
    @Value("${security.jwt.secret}")
    private String secret;
    
    public String getUri() {
        return uri;
    }
    
    public void setUri(String uri) {
        this.uri = uri;
    }
    
    public String getHeader() {
        return header;
    }
    
    public void setHeader(String header) {
        this.header = header;
    }
    
    public String getPrefix() {
        return prefix;
    }
    
    public void setPrefix(String prefix) {
        this.prefix = prefix;
    }
    
    public int getExpiration() {
        return expiration;
    }
    
    public void setExpiration(int expiration) {
        this.expiration = expiration;
    }
    
    public String getSecret() {
        return secret;
    }
    
    public void setSecret(String secret) {
        this.secret = secret;
    }
}
```

Tiếp theo ở các service khác, chẳng hạn như ở Zuul gateway chúng ta cần khai báo dependency common service trong file ```pom.xml```:
```
<!-- common dependency-->
<dependency>
    <groupId>com.example</groupId>
    artifactId>common-service</artifactId>
    <version>0.0.1-SNAPSHOT</version>
</dependency>
```
> Thêm dependency common-service vào trong các service muốn sử dụng JwtConfig
> Ở đây tạm thời chỉ có 1 class JwtConfig là sẽ được dùng chung, tương lai sẽ có nhiều hơn nên mình tách ra thành common luôn để sử dụng sau này

**Note**: *Các service khác sẽ dùng chung class JwtConfig, còn về các value security.jwt.uri, security.jwt.header, ... sẽ được config riêng trong file ```application.yml``` của từng service.*

Như vậy là đã xong phần security trong **Zuull gateway**, tiếp theo đây sẽ tạo mới **Auth service**

# 5. Auth Service
Trong auth service, chúng ta sẽ làm hai việc: một là xác thực định danh mà người dùng cung cấp và hai là gen ra một token trong trường hợp xác thực hợp lệ hoặc trả về một exception nếu nó không hợp lệ.
Trong file ```pom.xml``` chúng ta cần các dependencies sau: Web, Eureka Client, Spring Security và JWT.
```
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security</artifactId>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt</artifactId>
            <version>0.9.0</version>
        </dependency>

        <!--common dependency-->
        <dependency>
            <groupId>com.example</groupId>
            <artifactId>common-service</artifactId>
            <version>0.0.1-SNAPSHOT</version>
        </dependency>

        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
```
File ```application.yml``` khai báo như các service khác:
```
server:
  port: 8082

eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka

spring:
  application:
    name: auth-service
  cloud:
    config:
      uri: http://localhost:8888

security:
  jwt:
    uri: /auth/**
    header: Authorization
    prefix: Bearer
    expiration: 86400
    secret: JwtSecretKey
```
Ở trong class application cũng cần khai báo đây là Eureka client và đánh anotation ```@EnableWebSecurity``` cho nó:
```
package com.example.authservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.EnableEurekaClient;

@SpringBootApplication
@EnableEurekaClient
public class AuthServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(AuthServiceApplication.class, args);
    }
}
```

Giống như cấu hình cổng Gateway, chúng ta cần tạo một lớp extends từ ```WebSecurityConfigurerAdapter```:
```
package com.example.authservice.security;

import com.example.commonservice.security.JwtConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityConfigurerAdapter;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import javax.servlet.http.HttpServletResponse;
import javax.ws.rs.HttpMethod;

@EnableWebSecurity
public class SecurityCredentialsConfig  extends WebSecurityConfigurerAdapter {
    
    @Autowired
    private UserDetailsService userDetailsService;
    
    @Autowired
    private JwtConfig jwtConfig;
    
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http
                .csrf().disable()
                // make sure we use stateless session; session won't be used to store user's state.
                .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                .and()
                // handle an authorized attempts
                .exceptionHandling().authenticationEntryPoint((req, rsp, e) -> rsp.sendError(HttpServletResponse.SC_UNAUTHORIZED))
                .and()
                // Add a filter to validate user credentials and add token in the response header
                // What's the authenticationManager()?
                // An object provided by WebSecurityConfigurerAdapter, used to authenticate the user passing user's credentials
                // The filter needs this auth manager to authenticate the user.
                .addFilter(new JwtUsernameAndPasswordAuthenticationFilter(authenticationManager(), jwtConfig))
                .authorizeRequests()
                // allow all POST requests
                .antMatchers(HttpMethod.POST, jwtConfig.getUri()).permitAll()
                .antMatchers(HttpMethod.GET, "/auth/test").permitAll()
                // any other requests must be authenticated
                .anyRequest().authenticated();
    }
    
    // Spring has UserDetailsService interface, which can be overriden to provide our implementation for fetching user from database (or any other source).
    // The UserDetailsService object is used by the auth manager to load the user from database. // In addition, we need to define the password encoder also. So, auth manager can compare and verify passwords.  @Override
    protected void configure(AuthenticationManagerBuilder auth) throws Exception {
        auth.userDetailsService(userDetailsService).passwordEncoder(passwordEncoder());
    }
    
    @Bean
    public BCryptPasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
    
    @Bean
    public JwtConfig jwtConfig(){
        return new JwtConfig();
    }
}
```
Trong đoạn code trên, chúng ta sử dụng interface ```UserDetailsService``` nên chúng ta cần implement nó:
```
package com.example.authservice.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.List;

@Service
public class UserDetailsServiceImpl implements UserDetailsService {
    @Autowired
    private BCryptPasswordEncoder encoder;
    
    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        
        // TODO get user by username in db currently we hardcode user for test
        // hard coding the users. All passwords must be encoded.
        final List<AppUser> users = Arrays.asList(
                new AppUser(1, "user", encoder.encode("12345"), "USER"),
                new AppUser(2, "admin", encoder.encode("12345"), "ADMIN")
        );
        
        
        for(AppUser appUser: users) {
            if(appUser.getUsername().equals(username)) {
                
                // Remember that Spring needs roles to be in this format: "ROLE_" + userRole (i.e. "ROLE_ADMIN")
                // So, we need to set it to that format, so we can verify and compare roles (i.e. hasRole("ADMIN")).
                List<GrantedAuthority> grantedAuthorities = AuthorityUtils
                         .commaSeparatedStringToAuthorityList("ROLE_" + appUser.getRole());
                
                // The "User" class is provided by Spring and represents a model class for user to be returned by UserDetailsService
                // And used by auth manager to verify and check user authentication.
                return new User(appUser.getUsername(), appUser.getPassword(), grantedAuthorities);
            }
        }
        
        // If user not found. Throw this exception.
        throw new UsernameNotFoundException("Username: " + username + " not found");
    }
    
    // A (temporary) class represent the user saved in the database.
    private static class AppUser {
        private Integer id;
        private String username, password;
        private String role;
        
        public AppUser(Integer id, String username, String password, String role) {
            this.id = id;
            this.username = username;
            this.password = password;
            this.role = role;
        }
        
        public Integer getId() {
            return id;
        }
        
        public void setId(Integer id) {
            this.id = id;
        }
        
        public String getUsername() {
            return username;
        }
        
        public void setUsername(String username) {
            this.username = username;
        }
        
        public String getPassword() {
            return password;
        }
        
        public void setPassword(String password) {
            this.password = password;
        }
        
        public String getRole() {
            return role;
        }
        
        public void setRole(String role) {
            this.role = role;
        }
    }
}
```
Bước tiếp theo cũng là bước cuối cùng, chúng ta cần một filter. Ở đây chúng ta sử dụng ```JwtUsernameAndPasswordAuthenticationFilter``` để xác thực định danh người dùng và tạo token. Các thông tin về username hay password phải được gửi dưới dạng POST request.
```
package com.example.authservice.security;

import com.example.commonservice.security.JwtConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.Date;
import java.util.stream.Collectors;

public class JwtUsernameAndPasswordAuthenticationFilter extends UsernamePasswordAuthenticationFilter {
    // We use auth manager to validate the user credentials
    private AuthenticationManager authManager;
    
    private final JwtConfig jwtConfig;
    
    public JwtUsernameAndPasswordAuthenticationFilter(AuthenticationManager authManager, JwtConfig jwtConfig) {
        this.authManager = authManager;
        this.jwtConfig = jwtConfig;
        
        // By default, UsernamePasswordAuthenticationFilter listens to "/login" path.
        // In our case, we use "/auth". So, we need to override the defaults.
        this.setRequiresAuthenticationRequestMatcher(new AntPathRequestMatcher(jwtConfig.getUri(), "POST"));
    }
    
    @Override
    public Authentication attemptAuthentication(HttpServletRequest request, HttpServletResponse response)
            throws AuthenticationException {
        
        try {
            
            // 1. Get credentials from request
            UserCredentials creds = new ObjectMapper().readValue(request.getInputStream(), UserCredentials.class);
            
            // 2. Create auth object (contains credentials) which will be used by auth manager
            UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                    creds.getUsername(), creds.getPassword(), Collections.emptyList());
            
            // 3. Authentication manager authenticate the user, and use UserDetialsServiceImpl::loadUserByUsername() method to load the user.
            return authManager.authenticate(authToken);
            
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
    
    // Upon successful authentication, generate a token.
    // The 'auth' passed to successfulAuthentication() is the current authenticated user.  @Override
    protected void successfulAuthentication(HttpServletRequest request, HttpServletResponse response, FilterChain chain,
                                            Authentication auth) throws IOException, ServletException {
        
        Long now = System.currentTimeMillis();
        String token = Jwts.builder()
                .setSubject(auth.getName())
                // Convert to list of strings.
                // This is important because it affects the way we get them back in the Gateway.
                .claim("authorities", auth.getAuthorities().stream()
                        .map(GrantedAuthority::getAuthority).collect(Collectors.toList()))
                .setIssuedAt(new Date(now))
                .setExpiration(new Date(now + jwtConfig.getExpiration() * 1000))  // in milliseconds
                .signWith(SignatureAlgorithm.HS512, jwtConfig.getSecret().getBytes())
                .compact();
        
        // Add token to header
        response.addHeader(jwtConfig.getHeader(), jwtConfig.getPrefix() + token);
    }
    
    // A (temporary) class just to represent the user credentials
    private static class UserCredentials {
        private String username, password;
        
        public String getUsername() {
            return username;
        }
        
        public void setUsername(String username) {
            this.username = username;
        }
        
        public String getPassword() {
            return password;
        }
        
        public void setPassword(String password) {
            this.password = password;
        }
    }
}
```
>Trong Auth service cũng đã sử dụng đến JwtConfig việc này tránh trùng lặp code

# 6. Testing
Chạy lần lượt các service Eureka, Zuul, Auth và User.

Đầu tiên chúng ta thử truy cập vào user service thông qua đường dẫn ```localhost:8762/user/user-info``` mà không có token. Chúng ta sẽ nhận về một lỗi 401 như sau:
```
{
    "timestamp": "2023-08-11T09:26:08.131+0000",
    "status": 401,
    "error": "Unauthorized",
    "message": "No message available",
    "path": "/user/user-info"
}
```

Để nhận **token**, chúng ta call api authentication ```localhost:8762/auth```
![Scenario 1: Across columns](/blog/microservice/authen.png)

Bây giờ gọi lại **user service** kèm theo một **token** trong header:
![Scenario 1: Across columns](/blog/microservice/user-info-auth.png)

Ngoài ta thì bạn có thể thử chạy nhiều instance của user service để test xem các request được phân tán như thế nào. Trong phần tiếp theo, chúng ta sẽ tìm hiểu các xử lý lỗi và theo dõi trong mô hình microservice.